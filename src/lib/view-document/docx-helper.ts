/** DOCX 렌더링 헬퍼 */
export type DocxRenderTarget = HTMLDivElement | null;

declare global {
  interface Window {
    docxPreview?: {
      renderAsync: (
        file: File,
        target: DocxRenderTarget,
        options?: Record<string, unknown>
      ) => Promise<unknown>;
    };
  }
}

/** docx-preview가 로드됐는지 확인 */
export function isDocxPreviewReady(): boolean {
  return !!(window as any).docxPreview;
}

/** DOCX 렌더링 옵션을 반환한다. */
export function docxPreviewOptions(): Record<string, unknown> {
  return {
    ignoreWidth: false,
    ignoreReadOnly: true,
    provisionLayout: false,
    extractTitle: true,
  };
}
