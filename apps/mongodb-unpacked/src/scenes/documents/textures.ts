import * as THREE from 'three';
import { keyIdentity } from '../../lessons/data-modeling/indexes/operations.ts';
import type {
  DataValue,
  IndexView,
  ModelingDocument,
} from '../../lessons/data-modeling/types.ts';
import { drawDocumentGlyph } from './glyphs.ts';
// Both texture factories allocate GPU-backed resources. ModelingScene owns the returned
// textures and must dispose them when replacing a face or clearing the scene.
export const colors: Record<ModelingDocument['kind'], string> = {
  document: '#4d967a',
  book: '#4d967a',
  apparel: '#b68b50',
  audio: '#8b78ba',
  order: '#4d967a',
  customer: '#718ec2',
  address: '#b68b50',
  page: '#718ec2',
};
export function createDocumentTexture(
  document: ModelingDocument,
  highlights: string[],
  matched: boolean | null,
  maxAnisotropy: number,
) {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 960;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fcfdf9';
  ctx.fillRect(0, 0, 768, 960);
  const color = colors[document.kind];
  drawDocumentGlyph(ctx, document.kind, color);
  const fit = (text: string, max: number) => {
    let result = text;
    while (result.length > 2 && ctx.measureText(result).width > max)
      result = result.slice(0, -2) + '…';
    return result;
  };
  ctx.fillStyle = color;
  ctx.font = '500 21px ui-monospace, monospace';
  ctx.fillText(
    document.storage === 'view'
      ? 'APPLICATION VIEW'
      : document.storage === 'draft'
        ? 'DRAFT OBJECT'
        : 'BSON DOCUMENT',
    140,
    66,
  );
  ctx.fillStyle = '#244c38';
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillText(fit(document.title, 570), 140, 106);
  ctx.fillStyle = '#849a87';
  ctx.font = '22px ui-monospace, monospace';
  ctx.fillText(document.collection, 42, 168);
  ctx.strokeStyle = '#dfe8da';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(42, 195);
  ctx.lineTo(726, 195);
  ctx.stroke();
  // Card faces are compact previews: expand one object level and abbreviate deeper values.
  // The React inspector shows the complete data; drawing never changes the lesson snapshot.
  const rows: { key: string; value: string; parent: string; child: boolean }[] = [];
  const summary = (value: DataValue): string =>
    Array.isArray(value)
      ? value.some((v) => typeof v === 'object')
        ? `[ ${value.length} items ]`
        : JSON.stringify(value)
      : value !== null && typeof value === 'object'
        ? '{ … }'
        : JSON.stringify(value);
  for (const [key, value] of Object.entries(document.data)) {
    rows.push({ key, value: summary(value), parent: key, child: false });
    if (value !== null && typeof value === 'object' && !Array.isArray(value))
      for (const [k, v] of Object.entries(value))
        rows.push({ key: k, value: summary(v), parent: key, child: true });
  }
  const rowHeight = Math.min(65, 590 / Math.max(rows.length, 1));
  let y = 251;
  for (const row of rows) {
    // Highlighting a top-level field also highlights its expanded child rows.
    if (highlights.includes(row.parent)) {
      ctx.fillStyle = color + '19';
      ctx.beginPath();
      ctx.roundRect(28, y - 31, 710, rowHeight - 7, 8);
      ctx.fill();
    }
    const x = row.child ? 75 : 43;
    ctx.fillStyle = row.child ? '#94a58c' : '#769278';
    ctx.font = `${row.child ? 32 : 35}px ui-monospace, monospace`;
    const key = row.key + ': ';
    ctx.fillText(key, x, y);
    const width = ctx.measureText(key).width;
    ctx.fillStyle = '#31553e';
    ctx.fillText(fit(row.value, 705 - x - width), x + width, y);
    y += rowHeight;
  }
  ctx.fillStyle = matched === false ? '#a2a99c' : color;
  ctx.font = '22px ui-monospace, monospace';
  ctx.fillText(
    matched === true
      ? '✓ MATCHES QUERY'
      : matched === false
        ? 'STORED · NOT IN RESULT'
        : document.storage === 'view'
          ? 'RENDERED RESPONSE'
          : document.storage === 'draft'
            ? 'CHECKOUT INPUT'
            : '{  select to inspect  }',
    42,
    902,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Improve text legibility at oblique camera angles without exceeding GPU capabilities.
  texture.anisotropy = Math.min(8, maxAnisotropy);
  return texture;
}
export function createIndexTexture(
  view: IndexView,
  docs: ModelingDocument[],
  maxAnisotropy: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 920;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fcfaff';
  ctx.fillRect(0, 0, 768, 920);
  ctx.fillStyle = '#8b78ba';
  ctx.font = '500 25px ui-monospace, monospace';
  ctx.fillText('QUERY INDEX', 40, 67);
  ctx.fillStyle = '#584975';
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.fillText(view.present ? view.name : 'No supporting index', 40, 128);
  ctx.font = '26px ui-monospace, monospace';
  ctx.fillStyle = '#968aa8';
  ctx.fillText(
    view.present ? view.fields.join(' ↑  /  ') + ' ↑' : 'The _id index still exists.',
    40,
    186,
  );
  ctx.strokeStyle = '#e3ddec';
  ctx.beginPath();
  ctx.moveTo(40, 217);
  ctx.lineTo(728, 217);
  ctx.stroke();
  if (!view.present) {
    ctx.fillStyle = '#a59bae';
    ctx.font = '32px system-ui, sans-serif';
    ctx.fillText('Scan the collection', 75, 404);
    ctx.fillText('to test this filter.', 75, 456);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = '#d9d0e4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(180 + i * 110, 540, 75, 105, 8);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#9e92ad';
    ctx.font = '22px ui-monospace, monospace';
    ctx.fillText('ORDERED KEY', 42, 266);
    ctx.fillText('DOCUMENT', 542, 266);
    const rowHeight = view.entries.length > 4 ? 75 : 125;
    // The lesson's index operations supply key order; rendering must not re-sort it.
    view.entries.forEach((entry, i) => {
      const y = 310 + i * rowHeight,
        selected = view.selectedKeys.includes(keyIdentity(entry));
      ctx.fillStyle = selected ? '#e6dcf3' : '#f2edf8';
      ctx.beginPath();
      ctx.roundRect(27, y - 8, 712, rowHeight - 18, 10);
      ctx.fill();
      ctx.fillStyle = selected ? '#715297' : '#897795';
      ctx.font = '34px ui-monospace, monospace';
      ctx.fillText(entry.values.join(' · '), 46, y + 40);
      ctx.fillStyle = '#9c8db0';
      ctx.font = '28px ui-monospace, monospace';
      ctx.fillText(
        '→ #' + docs.find((d) => d.id === entry.documentId)!.data._id,
        542,
        y + 38,
      );
    });
  }
  ctx.fillStyle = '#998cab';
  ctx.font = '23px ui-monospace, monospace';
  ctx.fillText(
    view.present ? 'LOGICAL KEYS · SELECT TO INSPECT' : 'BUILD AN INDEX IN STEP 3',
    40,
    876,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  return texture;
}
