import type { DocumentKind } from '../../lessons/data-modeling/types.ts';
/** Add a glyph here when a lesson introduces a new kind of document card. */
export const documentGlyphs: Record<
  DocumentKind,
  (ctx: CanvasRenderingContext2D) => void
> = {
  page(ctx) {
    ctx.beginPath();
    ctx.roundRect(10, 17, 56, 42, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 29);
    ctx.lineTo(66, 29);
    ctx.stroke();
    ctx.strokeRect(17, 36, 14, 14);
    ctx.beginPath();
    ctx.moveTo(39, 38);
    ctx.lineTo(58, 38);
    ctx.moveTo(39, 47);
    ctx.lineTo(54, 47);
    ctx.stroke();
  },
  book(ctx) {
    ctx.beginPath();
    ctx.moveTo(38, 56);
    ctx.lineTo(38, 22);
    ctx.quadraticCurveTo(25, 14, 14, 20);
    ctx.lineTo(14, 53);
    ctx.quadraticCurveTo(28, 48, 38, 56);
    ctx.quadraticCurveTo(48, 48, 62, 53);
    ctx.lineTo(62, 20);
    ctx.quadraticCurveTo(50, 14, 38, 22);
    ctx.stroke();
  },
  apparel(ctx) {
    ctx.beginPath();
    ctx.moveTo(25, 18);
    ctx.lineTo(14, 24);
    ctx.lineTo(8, 38);
    ctx.lineTo(21, 42);
    ctx.lineTo(23, 58);
    ctx.lineTo(53, 58);
    ctx.lineTo(55, 42);
    ctx.lineTo(68, 38);
    ctx.lineTo(62, 24);
    ctx.lineTo(51, 18);
    ctx.quadraticCurveTo(38, 33, 25, 18);
    ctx.stroke();
  },
  audio(ctx) {
    ctx.beginPath();
    ctx.arc(38, 38, 22, Math.PI, 0);
    ctx.stroke();
    ctx.strokeRect(13, 37, 11, 22);
    ctx.strokeRect(52, 37, 11, 22);
  },
  customer(ctx) {
    ctx.beginPath();
    ctx.arc(38, 26, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(38, 59, 20, Math.PI, 0);
    ctx.stroke();
  },
  address(ctx) {
    ctx.beginPath();
    ctx.arc(38, 31, 17, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.lineTo(38, 63);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(38, 30, 5, 0, Math.PI * 2);
    ctx.stroke();
  },
  document(ctx) {
    ctx.beginPath();
    ctx.roundRect(20, 13, 36, 50, 3);
    ctx.stroke();
    for (let y = 28; y < 55; y += 10) {
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(48, y);
      ctx.stroke();
    }
  },
  order(ctx) {
    ctx.beginPath();
    ctx.roundRect(20, 13, 36, 50, 3);
    ctx.stroke();
    for (let y = 28; y < 55; y += 10) {
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(48, y);
      ctx.stroke();
    }
  },
};
export function drawDocumentGlyph(
  ctx: CanvasRenderingContext2D,
  kind: DocumentKind,
  color: string,
) {
  ctx.save();
  ctx.translate(42, 39);
  ctx.fillStyle = color + '20';
  ctx.beginPath();
  ctx.roundRect(0, 0, 76, 76, 17);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  documentGlyphs[kind](ctx);
  ctx.restore();
}
