import { useCallback } from "react";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useFirestoreQuery } from "./use-firestore-listener";

export interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PersistedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  type: string;
  content: string;
  timestamp: number;
  toolName?: string;
  workflowId?: string;
  runId?: string;
  workflowName?: string;
  ephemeral?: boolean;
}

/**
 * Live listener for the user's conversation list, ordered by most recent.
 */
export function useConversations(uid: string | null) {
  return useFirestoreQuery<Conversation>(
    uid && db
      ? () =>
          query(
            collection(db, "users", uid, "conversations"),
            orderBy("updatedAt", "desc"),
            limit(50),
          )
      : null,
    [uid],
  );
}

/**
 * Live listener for messages in a specific conversation.
 */
export function useConversationMessages(uid: string | null, conversationId: string | null) {
  return useFirestoreQuery<PersistedMessage>(
    uid && conversationId && db
      ? () =>
          query(
            collection(db, "users", uid, "conversations", conversationId, "messages"),
            orderBy("timestamp", "asc"),
          )
      : null,
    [uid, conversationId],
  );
}

/**
 * Create a new conversation and return its ID.
 */
export async function createConversation(uid: string, title = "New Chat"): Promise<string> {
  if (!db) throw new Error("Firestore not initialized");
  const ref = await addDoc(collection(db, "users", uid, "conversations"), {
    title,
    lastMessage: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Persist a single message to a conversation's subcollection.
 */
export async function addMessageToFirestore(
  uid: string,
  conversationId: string,
  message: PersistedMessage,
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const msgRef = doc(db, "users", uid, "conversations", conversationId, "messages", message.id);
  await setDoc(msgRef, {
    role: message.role,
    type: message.type,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.toolName ? { toolName: message.toolName } : {}),
    ...(message.workflowId ? { workflowId: message.workflowId } : {}),
    ...(message.runId ? { runId: message.runId } : {}),
    ...(message.workflowName ? { workflowName: message.workflowName } : {}),
    ...(message.ephemeral ? { ephemeral: message.ephemeral } : {}),
  });
}

/**
 * Update conversation metadata (lastMessage preview and updatedAt).
 */
export async function updateConversationMeta(
  uid: string,
  conversationId: string,
  lastMessage: string,
  title?: string,
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const ref = doc(db, "users", uid, "conversations", conversationId);
  await setDoc(
    ref,
    {
      lastMessage: lastMessage.slice(0, 100),
      updatedAt: serverTimestamp(),
      ...(title ? { title } : {}),
    },
    { merge: true },
  );
}

/**
 * Delete a conversation and its messages.
 * Note: Firestore doesn't recursively delete subcollections client-side,
 * but we delete the parent doc. Messages become orphaned but won't appear in queries.
 */
export async function deleteConversation(uid: string, conversationId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, "users", uid, "conversations", conversationId));
}

/**
 * Hook providing memoized persistence helpers bound to a specific user + conversation.
 */
export function useChatPersistence(uid: string | null, conversationId: string | null) {
  const persistMessage = useCallback(
    async (message: PersistedMessage) => {
      if (!uid || !conversationId) return;
      await addMessageToFirestore(uid, conversationId, message);
    },
    [uid, conversationId],
  );

  const updateMeta = useCallback(
    async (lastMessage: string, title?: string) => {
      if (!uid || !conversationId) return;
      await updateConversationMeta(uid, conversationId, lastMessage, title);
    },
    [uid, conversationId],
  );

  return { persistMessage, updateMeta };
}
