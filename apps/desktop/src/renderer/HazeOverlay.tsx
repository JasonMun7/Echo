/**
 * Full-screen purple border overlay. Window uses setIgnoreMouseEvents(true, { forward: true })
 * so mouse events pass through to the desktop. No content, no controls.
 */
export default function HazeOverlay() {
  return (
    <div
      className="echo-run-haze"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        pointerEvents: "none",
      }}
    />
  );
}
