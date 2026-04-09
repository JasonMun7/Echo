import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { apiFetch } from "@/lib/api";
import { useWorkflowSteps } from "@/hooks/use-firestore-listener";
import { GradientButton } from "@/components/ui/GradientButton";
import { colors } from "@echo/design-tokens";
import type { Step, BrowserStepAction, DesktopStepAction } from "@echo/types";

const BROWSER_ACTIONS: string[] = [
  "navigate", "click_at", "type_text_at", "scroll", "wait",
  "press_key", "select_option", "hover", "wait_for_element",
  "api_call",
];

const DESKTOP_ACTIONS: DesktopStepAction[] = [
  "click_at", "right_click", "double_click", "type_text_at", "hotkey",
  "scroll", "drag", "wait", "press_key", "open_app", "focus_app", "api_call",
];

export default function EditWorkflowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Steps come from Firestore real-time listener (same as web app)
  const { data: firestoreSteps } = useWorkflowSteps(id ?? null);
  const [localSteps, setLocalSteps] = useState<Step[] | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowType, setWorkflowType] = useState<"browser" | "desktop">("browser");
  const [saving, setSaving] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [showActionPicker, setShowActionPicker] = useState(false);
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use local steps if reordering in progress, otherwise use Firestore live data
  const steps = (localSteps ?? firestoreSteps) as Step[];

  // Sync editingStep when Firestore updates it
  useEffect(() => {
    if (editingStep && localSteps === null) {
      const updated = (firestoreSteps as Step[]).find((s) => s.id === editingStep.id);
      if (updated) setEditingStep(updated);
    }
  }, [firestoreSteps]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/workflows/${id}`);
      if (res.ok) {
        const data = await res.json();
        const wf = data.workflow ?? data;
        setWorkflowType(wf.workflow_type ?? "browser");
        setWorkflowName(wf.name ?? "");
      }
    } catch {}
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-save workflow name
  function onNameChange(name: string) {
    setWorkflowName(name);
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(async () => {
      await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    }, 500);
  }

  async function addStep(action: string) {
    setShowActionPicker(false);
    try {
      const res = await apiFetch(`/api/workflows/${id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, params: {}, context: "", order: steps.length }),
      });
      if (res.ok) {
        const data = await res.json();
        const newStep = data.step ?? data;
        // Clear local override so Firestore live data takes over (will include new step)
        setLocalSteps(null);
        setEditingStep(newStep);
      }
    } catch {
      Alert.alert("Error", "Failed to add step.");
    }
  }

  async function removeStep(stepId: string) {
    try {
      await apiFetch(`/api/workflows/${id}/steps/${stepId}`, { method: "DELETE" });
      // Firestore listener will update automatically
      if (editingStep?.id === stepId) setEditingStep(null);
    } catch {
      Alert.alert("Error", "Failed to delete step.");
    }
  }

  function saveStep(updated: Step) {
    setEditingStep(updated);
  }

  async function commitStep() {
    if (!editingStep) return;
    setSaving(true);
    try {
      await apiFetch(`/api/workflows/${id}/steps/${editingStep.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingStep.action,
          context: editingStep.context,
          params: editingStep.params,
        }),
      });
      setEditingStep(null);
    } catch {
      Alert.alert("Error", "Failed to save step.");
    } finally {
      setSaving(false);
    }
  }

  async function onDragEnd({ data }: { data: Step[] }) {
    const reordered = data.map((s, i) => ({ ...s, order: i }));
    // Use local state during reorder to avoid Firestore flicker
    setLocalSteps(reordered);
    try {
      await apiFetch(`/api/workflows/${id}/steps/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_ids: reordered.map((s) => s.id) }),
      });
    } catch {}
    // Clear local override after server confirms — Firestore will reflect new order
    setTimeout(() => setLocalSteps(null), 1500);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workflowName, status: "ready" }),
      });
      if (res.ok) {
        router.back();
      } else {
        Alert.alert("Error", "Failed to save.");
      }
    } catch {
      Alert.alert("Error", "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const actions = workflowType === "desktop" ? DESKTOP_ACTIONS : BROWSER_ACTIONS;

  function renderStepItem({ item, drag, isActive, getIndex }: RenderItemParams<Step>) {
    const index = getIndex() ?? 0;
    const missingContext = !item.context;
    return (
      <ScaleDecorator>
        <View
          style={[
            styles.stepCard,
            missingContext && styles.stepCardWarning,
            isActive && styles.stepCardDragging,
          ]}
        >
          <View style={styles.stepHeader}>
            <Pressable onLongPress={drag} delayLongPress={150} hitSlop={6} style={styles.dragHandle}>
              <Ionicons name="reorder-three-outline" size={20} color={colors.textLight} />
            </Pressable>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepAction}>{item.action}</Text>
              {item.context ? (
                <Text style={styles.stepContext} numberOfLines={1}>{item.context}</Text>
              ) : (
                <Text style={styles.stepMissing}>Tap to add details</Text>
              )}
            </View>
            <Pressable
              onPress={() => setEditingStep(item)}
              hitSlop={8}
              style={styles.editBtn}
            >
              <Ionicons name="pencil-outline" size={15} color={colors.lavender} />
            </Pressable>
            <Pressable
              onPress={() => removeStep(item.id)}
              hitSlop={8}
              style={styles.deleteBtn}
            >
              <Ionicons name="trash-outline" size={15} color={colors.error} />
            </Pressable>
          </View>
        </View>
      </ScaleDecorator>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Workflow Name */}
      <View style={styles.nameContainer}>
        <TextInput
          style={styles.nameInput}
          value={workflowName}
          onChangeText={onNameChange}
          placeholder="Workflow name..."
          placeholderTextColor={colors.textLight}
        />
      </View>

      {/* Steps List */}
      <DraggableFlatList
        data={steps}
        keyExtractor={(item) => item.id}
        renderItem={renderStepItem}
        onDragEnd={onDragEnd}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <Pressable style={styles.addBtn} onPress={() => setShowActionPicker(true)}>
            <Text style={styles.addBtnText}>+ Add Step</Text>
          </Pressable>
        }
      />

      {/* Step Editor Modal */}
      <Modal
        visible={editingStep !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingStep(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.editorModal}>
            <View style={styles.editorHeader}>
              <Text style={styles.editorTitle}>
                {editingStep ? `Step: ${editingStep.action}` : "Edit Step"}
              </Text>
            </View>
            {editingStep && (
              <ScrollView
                contentContainerStyle={styles.editorScroll}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.label}>Action type</Text>
                <View style={styles.actionRow}>
                  {actions.map((a) => (
                    <Pressable
                      key={a}
                      style={[
                        styles.actionChip,
                        editingStep.action === a && styles.actionChipActive,
                      ]}
                      onPress={() => saveStep({ ...editingStep, action: a, params: {} })}
                    >
                      <Text
                        style={[
                          styles.actionChipText,
                          editingStep.action === a && styles.actionChipTextActive,
                        ]}
                      >
                        {a}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Description / Context</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  placeholder="Describe what this step does (used by AI to locate elements)"
                  placeholderTextColor={colors.textLight}
                  value={editingStep.context}
                  onChangeText={(t) => saveStep({ ...editingStep, context: t })}
                  multiline
                />

                <StepParams step={editingStep} onUpdate={saveStep} />

            <View style={styles.modalSaveRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setEditingStep(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]}
                onPress={commitStep}
                disabled={saving}
              >
                <Text style={styles.modalSaveText}>{saving ? "Saving..." : "Save Step"}</Text>
              </Pressable>
            </View>
          </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Action Picker Modal */}
      <Modal visible={showActionPicker} transparent animationType="slide">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowActionPicker(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Step</Text>
            <View style={styles.modalActions}>
              {actions.map((a) => (
                <Pressable
                  key={a}
                  style={styles.modalActionBtn}
                  onPress={() => addStep(a)}
                >
                  <Text style={styles.modalActionText}>{a}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Save Footer */}
      <View style={styles.footer}>
        <GradientButton
          title="Save & Activate"
          gradient="primary"
          onPress={handleSave}
          loading={saving}
        />
      </View>
    </GestureHandlerRootView>
  );
}

/** Dynamic param fields based on step action */
function StepParams({
  step,
  onUpdate,
}: {
  step: Step;
  onUpdate: (s: Step) => void;
}) {
  const p = step.params ?? {};
  const set = (key: string, val: string) =>
    onUpdate({ ...step, params: { ...p, [key]: val } });

  switch (step.action) {
    case "navigate":
      return (
        <>
          <Text style={styles.label}>URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://example.com"
            placeholderTextColor={colors.textLight}
            value={(p.url as string) ?? ""}
            onChangeText={(t) => set("url", t)}
            keyboardType="url"
            autoCapitalize="none"
          />
        </>
      );

    case "type_text_at":
      return (
        <>
          <Text style={styles.label}>Text to type</Text>
          <TextInput
            style={styles.input}
            placeholder='Text or {{variable}}'
            placeholderTextColor={colors.textLight}
            value={(p.text as string) ?? ""}
            onChangeText={(t) => set("text", t)}
          />
        </>
      );

    case "press_key":
      return (
        <>
          <Text style={styles.label}>Key</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter, Tab, Escape..."
            placeholderTextColor={colors.textLight}
            value={(p.key as string) ?? ""}
            onChangeText={(t) => set("key", t)}
            autoCapitalize="none"
          />
        </>
      );

    case "hotkey":
      return (
        <>
          <Text style={styles.label}>Key combination</Text>
          <TextInput
            style={styles.input}
            placeholder="ctrl+c, cmd+shift+s..."
            placeholderTextColor={colors.textLight}
            value={Array.isArray(p.keys) ? p.keys.join("+") : String(p.keys ?? "")}
            onChangeText={(t) => set("keys", t)}
            autoCapitalize="none"
          />
        </>
      );

    case "scroll":
      return (
        <>
          <Text style={styles.label}>Direction</Text>
          <View style={styles.row}>
            {["down", "up"].map((d) => (
              <Pressable
                key={d}
                style={[
                  styles.actionChip,
                  (p.direction ?? "down") === d && styles.actionChipActive,
                ]}
                onPress={() => set("direction", d)}
              >
                <Text
                  style={[
                    styles.actionChipText,
                    (p.direction ?? "down") === d && styles.actionChipTextActive,
                  ]}
                >
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Amount (pixels)</Text>
          <TextInput
            style={styles.input}
            placeholder="300"
            placeholderTextColor={colors.textLight}
            value={String(p.amount ?? "")}
            onChangeText={(t) => set("amount", t)}
            keyboardType="numeric"
          />
        </>
      );

    case "wait":
      return (
        <>
          <Text style={styles.label}>Seconds</Text>
          <TextInput
            style={styles.input}
            placeholder="2"
            placeholderTextColor={colors.textLight}
            value={String(p.seconds ?? "")}
            onChangeText={(t) => set("seconds", t)}
            keyboardType="numeric"
          />
        </>
      );

    case "select_option":
      return (
        <>
          <Text style={styles.label}>Value</Text>
          <TextInput
            style={styles.input}
            placeholder="Option value to select"
            placeholderTextColor={colors.textLight}
            value={(p.value as string) ?? ""}
            onChangeText={(t) => set("value", t)}
          />
        </>
      );

    case "open_app":
    case "focus_app":
      return (
        <>
          <Text style={styles.label}>App name</Text>
          <TextInput
            style={styles.input}
            placeholder="Chrome, Slack, Terminal..."
            placeholderTextColor={colors.textLight}
            value={(p.app_name as string) ?? ""}
            onChangeText={(t) => set("app_name", t)}
          />
        </>
      );

    case "drag":
    case "drag_drop":
      return (
        <>
          <Text style={styles.label}>Source description</Text>
          <TextInput
            style={styles.input}
            placeholder="Drag from..."
            placeholderTextColor={colors.textLight}
            value={(p.source_description as string) ?? ""}
            onChangeText={(t) => set("source_description", t)}
          />
          <Text style={styles.label}>Target description</Text>
          <TextInput
            style={styles.input}
            placeholder="Drop to..."
            placeholderTextColor={colors.textLight}
            value={(p.target_description as string) ?? ""}
            onChangeText={(t) => set("target_description", t)}
          />
        </>
      );

    case "api_call":
      return (
        <>
          <Text style={styles.label}>Integration</Text>
          <TextInput
            style={styles.input}
            placeholder="slack, gmail, notion..."
            placeholderTextColor={colors.textLight}
            value={(p.integration as string) ?? ""}
            onChangeText={(t) => set("integration", t)}
            autoCapitalize="none"
          />
          <Text style={styles.label}>Method</Text>
          <TextInput
            style={styles.input}
            placeholder="send_message, list_channels..."
            placeholderTextColor={colors.textLight}
            value={(p.method as string) ?? ""}
            onChangeText={(t) => set("method", t)}
            autoCapitalize="none"
          />
          <Text style={styles.label}>Arguments (JSON)</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            placeholder='Slack: {"channel":"#general","text":"Hello"} — Google: {"to":"name@example.com","subject":"Hi","body":"…"}'
            placeholderTextColor={colors.textLight}
            value={typeof p.args === "string" ? p.args : p.args ? JSON.stringify(p.args, null, 2) : ""}
            onChangeText={(t) => set("args", t)}
            multiline
            autoCapitalize="none"
          />
        </>
      );

    // click_at, hover, wait_for_element, right_click, double_click — only need context/description
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ghost },
  nameContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: 16,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
    padding: 0,
  },
  listContent: { padding: 16, paddingBottom: 16 },
  stepCard: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  stepCardActive: { borderColor: colors.lavender },
  stepCardWarning: { borderColor: "rgba(245, 158, 11, 0.4)" },
  stepCardDragging: {
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dragHandle: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandleText: {
    fontSize: 16,
    color: colors.textLight,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.lavender20,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.lavender,
    fontFamily: "Inter-SemiBold",
  },
  stepInfo: { flex: 1 },
  stepAction: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  stepContext: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 2,
  },
  stepMissing: {
    fontSize: 12,
    color: "#f59e0b",
    fontFamily: "Inter",
    fontStyle: "italic",
    marginTop: 2,
  },
  editBtn: {
    padding: 6,
    marginRight: 2,
  },
  deleteBtn: {
    padding: 6,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: colors.lavender40,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  addBtnText: {
    color: colors.lavender,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
    fontSize: 14,
  },
  editorModal: {
    flex: 1,
    backgroundColor: colors.ghost,
  },
  editorScroll: {
    padding: 16,
    gap: 8,
    paddingBottom: 48,
  },
  editorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  editorTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  editorDoneBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  editorClose: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.lavender,
    fontFamily: "Inter-SemiBold",
  },
  modalSaveRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textMuted,
    fontFamily: "Inter-SemiBold",
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.lavender,
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Inter-SemiBold",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textMuted,
    fontFamily: "Inter-Medium",
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.ghost,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    fontFamily: "Inter",
  },
  row: { flexDirection: "row", gap: 8 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionChipActive: {
    borderColor: colors.lavender,
    backgroundColor: colors.lavender20,
  },
  actionChipText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
  },
  actionChipTextActive: {
    color: colors.lavender,
    fontWeight: "500",
  },
  footer: {
    padding: 16,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "60%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
    marginBottom: 16,
  },
  modalActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modalActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.ghost,
  },
  modalActionText: {
    fontSize: 14,
    color: colors.text,
    fontFamily: "Inter",
  },
});
