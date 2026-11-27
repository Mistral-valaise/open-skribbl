import { BRUSH_SIZES, type BrushSize } from '@kritzel/shared';
import { create } from 'zustand';
import { DEFAULT_COLOR } from '../canvas/palette.js';

export type DrawTool = 'brush' | 'eraser' | 'fill';

interface ToolState {
  tool: DrawTool;
  color: string;
  size: BrushSize;
}

/** The drawer's toolbar selection; local to this browser and kept across turns. */
export const useToolStore = create<ToolState>(() => ({
  tool: 'brush',
  color: DEFAULT_COLOR,
  size: BRUSH_SIZES[1],
}));

export function selectTool(tool: DrawTool): void {
  useToolStore.setState({ tool });
}

export function selectSize(size: BrushSize): void {
  useToolStore.setState({ size });
}

/** Picking a colour while erasing switches back to the brush. */
export function selectColor(color: string): void {
  useToolStore.setState((state) => ({
    color: color.toUpperCase(),
    tool: state.tool === 'eraser' ? 'brush' : state.tool,
  }));
}
