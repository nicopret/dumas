export function isSectionIncomplete(details: string): boolean {
  return details.trim().length === 0;
}

export const DEFAULT_PARAGRAPH_COUNT = 0;

export interface AiRewriteSession {
  rewriteSuggestion: string | null;
  titleSuggestions: string[];
  previousSuggestion: string | null;
}

export function emptyAiRewriteSession(): AiRewriteSession {
  return { rewriteSuggestion: null, titleSuggestions: [], previousSuggestion: null };
}

export function rewriteRequestPayload(originalDraft: string, paragraphCount = DEFAULT_PARAGRAPH_COUNT,
  rejectedSuggestion?: string, model?: string) {
  return { draft: originalDraft, paragraphCount, ...(rejectedSuggestion ? { previousSuggestion: rejectedSuggestion } : {}),
    ...(model ? { model } : {}) };
}

export function acceptRewriteSuggestion(currentDraft: string, suggestion: string | null): string {
  return suggestion ?? currentDraft;
}

export function acceptedRewriteUpdate(rewrite: string) {
  return { localDetails: rewrite, requestBody: { details: rewrite } };
}

export function acceptedTitleUpdate(title: string) {
  return { localTitle: title, requestBody: { title } };
}

export interface AiRewritePreview {
  rewrite: string;
  titleSuggestions: string[];
  rewriteAccepted: boolean;
  acceptedTitle: string | null;
}

export function createAiRewritePreview(rewrite: string, titleSuggestions: string[]): AiRewritePreview {
  return { rewrite, titleSuggestions: titleSuggestions.slice(0, 2), rewriteAccepted: false, acceptedTitle: null };
}

export function markPreviewRewriteAccepted(preview: AiRewritePreview): AiRewritePreview {
  return { ...preview, rewriteAccepted: true };
}

export function markPreviewTitleAccepted(preview: AiRewritePreview, title: string): AiRewritePreview {
  return { ...preview, acceptedTitle: title };
}
