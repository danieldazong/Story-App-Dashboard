export type UploadKind = "audio" | "cover" | "script";

export type UploadState =
  | { state: "queued" }
  | { state: "uploading"; uploadedBytes: number }
  | { state: "processing"; note: string }
  | { state: "complete" }
  | { state: "failed"; message: string };

export type UploadTarget = {
  bookId: string;
  chapterId?: string;
};

export type UploadItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  kind: UploadKind;
  target: UploadTarget;
} & UploadState;
