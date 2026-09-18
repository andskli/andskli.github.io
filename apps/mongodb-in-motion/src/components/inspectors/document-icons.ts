import {
  BookOpen,
  Braces,
  FileText,
  Headphones,
  MapPin,
  PanelTop,
  Shirt,
  UserRound,
} from 'lucide-react';
import type { DocumentKind } from '../../lessons/data-modeling/types.ts';
export const documentIcons: Record<DocumentKind, typeof Braces> = {
  document: Braces,
  book: BookOpen,
  apparel: Shirt,
  audio: Headphones,
  order: FileText,
  customer: UserRound,
  address: MapPin,
  page: PanelTop,
};
