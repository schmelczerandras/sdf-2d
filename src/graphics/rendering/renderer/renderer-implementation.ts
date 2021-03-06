import { ReadonlyVec2, vec2 } from 'gl-matrix';
import ResizeObserver from 'resize-observer-polyfill';
import { Drawable } from '../../../drawables/drawable';
import { DrawableDescriptor } from '../../../drawables/drawable-descriptor';
import { LightDrawable } from '../../../drawables/lights/light-drawable';
import { colorToString } from '../../../helper/color-to-string';
import { DefaultFrameBuffer } from '../../graphics-library/frame-buffer/default-frame-buffer';
import { IntermediateFrameBuffer } from '../../graphics-library/frame-buffer/intermediate-frame-buffer';
import { enableExtension } from '../../graphics-library/helper/enable-extension';
import { getHardwareInfo } from '../../graphics-library/helper/get-hardware-info';
import { WebGlStopwatch } from '../../graphics-library/helper/stopwatch';
import { ParallelCompiler } from '../../graphics-library/parallel-compiler';
import { ColorTexture } from '../../graphics-library/texture/color-texture';
import { DistanceTexture } from '../../graphics-library/texture/distance-texture';
import { PaletteTexture } from '../../graphics-library/texture/palette-texture';
import { Texture } from '../../graphics-library/texture/texture';
import { TextureWithOptions } from '../../graphics-library/texture/texture-options';
import {
  getUniversalRenderingContext,
  UniversalRenderingContext,
} from '../../graphics-library/universal-rendering-context';
import { DistanceRenderPass } from '../render-pass/distance-render-pass';
import { LightsRenderPass } from '../render-pass/lights-render-pass';
import { defaultRuntimeSettings } from '../settings/default-runtime-settings';
import { defaultStartupSettings } from '../settings/default-startup-settings';
import { RuntimeSettings } from '../settings/runtime-settings';
import { StartupSettings } from '../settings/startup-settings';
import distanceFragmentShader100 from '../shaders/distance-fs-100.glsl';
import distanceFragmentShader from '../shaders/distance-fs.glsl';
import distanceVertexShader100 from '../shaders/distance-vs-100.glsl';
import distanceVertexShader from '../shaders/distance-vs.glsl';
import lightsFragmentShader100 from '../shaders/shading-fs-100.glsl';
import lightsFragmentShader from '../shaders/shading-fs.glsl';
import lightsVertexShader100 from '../shaders/shading-vs-100.glsl';
import lightsVertexShader from '../shaders/shading-vs.glsl';
import { UniformsProvider } from '../uniforms-provider';
import { Renderer } from './renderer';
import { RendererInfo } from './renderer-info';

/** @internal */
export class RendererImplementation implements Renderer {
  private readonly gl: UniversalRenderingContext;
  private readonly uniformsProvider: UniformsProvider;
  private readonly distanceFieldFrameBuffer: IntermediateFrameBuffer;
  private readonly distancePass: DistanceRenderPass;
  private readonly lightingFrameBuffer: DefaultFrameBuffer;
  private readonly lightsPass: LightsRenderPass;
  private stopwatch?: WebGlStopwatch;
  private textures: Array<Texture> = [];
  private palette!: PaletteTexture;
  private _canvasSize: vec2;
  private blendFactor!: number;
  private canvasResizeObserver!: ResizeObserver;

  private applyRuntimeSettings: {
    [key in keyof RuntimeSettings]: (value: any) => void;
  } = {
    enableHighDpiRendering: (v) => {
      this.distanceFieldFrameBuffer.enableHighDpiRendering = v;
      this.lightingFrameBuffer.enableHighDpiRendering = v;
    },
    tileMultiplier: (v) => (this.distancePass.tileMultiplier = v),
    isWorldInverted: (v) => (this.distancePass.isWorldInverted = v),
    distanceRenderScale: (v) => {
      this.distanceFieldFrameBuffer.renderScale = v;
      this.gl.insights.renderPasses.distance.renderScale = v;
    },
    motionBlur: (v) => (this.blendFactor = 1 - v),
    lightsRenderScale: (v) => {
      this.lightingFrameBuffer.renderScale = v;
      this.gl.insights.renderPasses.lights.renderScale = v;
    },
    textures: this.setTextures.bind(this),
    ambientLight: (v) => (this.uniformsProvider.ambientLight = v),
    lightCutoffDistance: (v) => (this.lightsPass.lightCutoffDistance = v),
    colorPalette: (v) => this.palette.setPalette(v),
  };

  setRuntimeSettings(overrides: Partial<RuntimeSettings>): void {
    Object.entries(overrides).forEach(([k, v]) => {
      if (k in this.applyRuntimeSettings) {
        this.applyRuntimeSettings[k as keyof RuntimeSettings](v);
      }
    });
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly descriptors: Array<DrawableDescriptor>,
    ignoreWebGL2?: boolean
  ) {
    this.gl = getUniversalRenderingContext(
      canvas,
      ignoreWebGL2 !== undefined ? ignoreWebGL2 : defaultStartupSettings.ignoreWebGL2
    );

    this.gl.blendFunc(this.gl.CONSTANT_COLOR, this.gl.ONE_MINUS_CONSTANT_COLOR);

    const { width, height } = canvas.getBoundingClientRect();
    this._canvasSize = vec2.fromValues(width, height);

    this.applyCanvasResizeObserver();

    this.distanceFieldFrameBuffer = new IntermediateFrameBuffer(this.gl, this.canvasSize);
    this.lightingFrameBuffer = new DefaultFrameBuffer(this.gl, this.canvasSize);

    this.distancePass = new DistanceRenderPass(this.gl, this.distanceFieldFrameBuffer);
    this.lightsPass = new LightsRenderPass(this.gl, this.lightingFrameBuffer);

    this.uniformsProvider = new UniformsProvider(this);

    this.setViewArea(
      vec2.fromValues(0, this.canvasSize.y),
      vec2.fromValues(this.canvasSize.x, this.canvasSize.y)
    );

    const hardwareInfo = getHardwareInfo(this.gl);
    this.gl.insights.renderer = hardwareInfo?.renderer;
    this.gl.insights.vendor = hardwareInfo?.vendor;
  }

  private applyCanvasResizeObserver() {
    this.canvasResizeObserver = new ResizeObserver((e) => {
      const entry = e[0];
      this._canvasSize = vec2.fromValues(
        entry.contentRect.width,
        entry.contentRect.height
      );
      this.uniformsProvider.calculateScreenToWorldTransformations();
    });
    this.canvasResizeObserver.observe(this.canvas);
  }

  public async initialize(settingsOverrides: Partial<StartupSettings>): Promise<void> {
    const settings = {
      ...defaultStartupSettings,
      ...settingsOverrides,
    };

    this.palette = new PaletteTexture(this.gl, settings.paletteSize);
    this.setRuntimeSettings(defaultRuntimeSettings);

    const promises: Array<Promise<void>> = [];
    const compiler = new ParallelCompiler(this.gl);

    promises.push(
      this.distancePass.initialize(
        this.gl.isWebGL2
          ? [distanceVertexShader, distanceFragmentShader]
          : [distanceVertexShader100, distanceFragmentShader100],
        this.descriptors.filter(RendererImplementation.hasSdf),
        compiler,
        {
          paletteSize: settings.paletteSize,
          floatLinearEnabled: this.gl.insights.floatInterpolationEnabled ? '1' : '0',
          backgroundColor: colorToString(settings.backgroundColor),
        }
      )
    );
    promises.push(
      this.lightsPass.initialize(
        this.gl.isWebGL2
          ? [lightsVertexShader, lightsFragmentShader]
          : [lightsVertexShader100, lightsFragmentShader100],
        this.descriptors.filter((d) => !RendererImplementation.hasSdf(d)),
        compiler,
        {
          shadowTraceCount: settings.shadowTraceCount.toString(),
          intensityInsideRatio: settings.lightPenetrationRatio,
          floatLinearEnabled: this.gl.insights.floatInterpolationEnabled ? '1' : '0',
          backgroundColor: colorToString(settings.backgroundColor),
        }
      )
    );

    await compiler.compilePrograms();
    await Promise.all(promises);

    if (settings.enableStopwatch && this.gl.isWebGL2) {
      try {
        this.stopwatch = new WebGlStopwatch(this.gl);
      } catch {
        // no problem
      }
    }
  }

  public get insights(): RendererInfo {
    return this.gl.insights;
  }

  private setTextures(v: { [textureName: string]: TexImageSource | TextureWithOptions }) {
    this.textures.forEach((t) => t.destroy());
    this.textures = [];

    let id = 3;
    for (const key in v) {
      this.uniformsProvider.textures[key] = id;
      let texture: Texture;

      if (Object.prototype.hasOwnProperty.call(v[key], 'source')) {
        texture = new Texture(this.gl, id++, (v[key] as TextureWithOptions).overrides);
        texture.setImage((v[key] as TextureWithOptions).source);
      } else {
        texture = new Texture(this.gl, id++);
        texture.setImage(v[key] as TexImageSource);
      }

      this.textures.push(texture);
    }
  }

  private static hasSdf(descriptor: DrawableDescriptor) {
    return Object.prototype.hasOwnProperty.call(descriptor, 'sdf');
  }

  public addDrawable(drawable: Drawable): void {
    if (
      RendererImplementation.hasSdf((drawable.constructor as typeof Drawable).descriptor)
    ) {
      this.distancePass.addDrawable(drawable);
    } else {
      this.lightsPass.addDrawable(drawable as LightDrawable);
    }
  }

  public renderDrawables() {
    if (this.stopwatch) {
      if (this.stopwatch.isReady) {
        this.stopwatch.start();
      } else {
        this.stopwatch.tryGetResults();
        this.gl.insights.gpuRenderTimeInMilliseconds = this.stopwatch.resultsInMilliseconds;
      }
    }

    this.distanceFieldFrameBuffer.setSize(this.canvasSize);
    const lightsSizeChanged = this.lightingFrameBuffer.setSize(this.canvasSize);

    const common = {
      // texture units
      distanceTexture: DistanceTexture.textureUnitId,
      colorTexture: ColorTexture.textureUnitId,
      palette: PaletteTexture.textureUnitId,

      distanceNdcPixelSize: 2 / Math.max(...this.distanceFieldFrameBuffer.getSize()),
      shadingNdcPixelSize: 2 / Math.max(...this.lightingFrameBuffer.getSize()),
    };

    this.distancePass.render(this.uniformsProvider.getUniforms(common), [
      this.palette,
      ...this.textures,
    ]);

    if (!lightsSizeChanged) {
      this.gl.enable(this.gl.BLEND);
      this.gl.blendColor(this.blendFactor, this.blendFactor, this.blendFactor, 1);
    }

    this.lightsPass.render(
      this.uniformsProvider.getUniforms(common),
      this.distanceFieldFrameBuffer.textures
    );

    this.gl.disable(this.gl.BLEND);

    this.distanceFieldFrameBuffer.invalidate();

    if (this.stopwatch?.isRunning) {
      this.stopwatch?.stop();
    }
  }

  public displayToWorldCoordinates(displayCoordinates: ReadonlyVec2): vec2 {
    return this.uniformsProvider.screenToWorldPosition(displayCoordinates);
  }

  public worldToDisplayCoordinates(worldCoordinates: ReadonlyVec2): vec2 {
    return this.uniformsProvider.worldToDisplayCoordinates(worldCoordinates);
  }

  public setViewArea(topLeft: ReadonlyVec2, size: ReadonlyVec2) {
    this.uniformsProvider.setViewArea(topLeft, size);
  }

  public get viewAreaSize(): ReadonlyVec2 {
    return this.uniformsProvider.getViewArea();
  }

  public get canvasSize(): ReadonlyVec2 {
    return this._canvasSize;
  }

  public destroy(): void {
    this.canvasResizeObserver.disconnect();

    this.distancePass.destroy();
    this.lightsPass.destroy();
    this.palette.destroy();

    const ext = enableExtension(this.gl, 'WEBGL_lose_context');
    ext.loseContext();
  }
}
