// Branche le lecteur de tablature (utils/tabImage.ts) sur un canvas Node, même API que le navigateur.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { setCanvasPlatform } from '../../utils/tabImage';

export const useNodeCanvas = () => setCanvasPlatform({
  createCanvas: (width, height) => createCanvas(width, height) as any,
  loadImage: (src) => loadImage(src) as any,
});
