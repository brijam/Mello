export interface ChecklistItem {
  id: string;
  checklistId: string;
  name: string;
  checked: boolean;
  position: number;
}

export interface Checklist {
  id: string;
  cardId: string;
  name: string;
  position: number;
  items: ChecklistItem[];
}
