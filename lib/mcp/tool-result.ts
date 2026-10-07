// A tool that has pictures to show returns them next to its answer. The endpoint sends the answer as
// text and each picture as an image the app can look at.

export type McpImage = { mimeType: "image/jpeg" | "image/png"; data: string }; // data is base64

export type WithImages<T> = { value: T; images: McpImage[]; readonly withImages: true };

export function withImages<T>(value: T, images: McpImage[]): WithImages<T> {
  return { value, images, withImages: true };
}

export function isWithImages(output: unknown): output is WithImages<unknown> {
  return typeof output === "object" && output !== null && (output as { withImages?: unknown }).withImages === true;
}
