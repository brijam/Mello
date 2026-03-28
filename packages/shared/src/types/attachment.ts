export interface Attachment {
  id: string;
  cardId: string;
  userId: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number;
  thumbnailPath: string | null;
  createdAt: string;
}
