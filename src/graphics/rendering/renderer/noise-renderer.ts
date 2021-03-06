import { ReadonlyVec2 } from 'gl-matrix';
import { DefaultFrameBuffer } from '../../graphics-library/frame-buffer/default-frame-buffer';
import { ParallelCompiler } from '../../graphics-library/parallel-compiler';
import { FragmentShaderOnlyProgram } from '../../graphics-library/program/fragment-shader-only-program';
import { getUniversalRenderingContext } from '../../graphics-library/universal-rendering-context';
import randomFragment100 from '../shaders/random-fs-100.glsl';
import randomFragment from '../shaders/random-fs.glsl';
import randomVertex100 from '../shaders/random-vs-100.glsl';
import randomVertex from '../shaders/random-vs.glsl';

/**
 * Create a renderer, draw a 2D noise texture with it,
 * then destroy the used resources,
 * while returning the generated texture in the form of a canvas.
 *
 * @param textureSize The resolution of the end result
 * @param scale A starting value can be 15
 * @param amplitude A starting value can be 1
 * @param ignoreWebGL2 Ignore WebGL2, even when it's available
 */
export const renderNoise = async (
  textureSize: ReadonlyVec2,
  scale: number,
  amplitude: number,
  ignoreWebGL2 = false
): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement('canvas');
  const gl = getUniversalRenderingContext(canvas, ignoreWebGL2);

  const frameBuffer = new DefaultFrameBuffer(gl, textureSize);
  const program = new FragmentShaderOnlyProgram(gl);
  const compiler = new ParallelCompiler(gl);

  const programPromise = program.initialize(
    gl.isWebGL2 ? [randomVertex, randomFragment] : [randomVertex100, randomFragment100],
    compiler
  );

  await compiler.compilePrograms();
  await programPromise;

  frameBuffer.bindAndClear();
  program.draw({
    scale,
    amplitude,
  });

  frameBuffer.destroy();
  program.destroy();

  return canvas;
};
