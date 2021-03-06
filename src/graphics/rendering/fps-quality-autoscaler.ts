import { clamp } from '../../helper/clamp';
import { Renderer } from './renderer/renderer';

/**
 * Set the quality of rendering based on FPS values.
 *
 * When using this the size of the canvas must be fixed with CSS.
 *
 * The `addDeltaTime` method should be called once every frame.
 *
 * Usage:
 * ```js
 *  const renderer = await compile(...);
 *  const autoscaler = new FpsQualityAutoscaler(renderer);
 * ```
 */
export class FpsQualityAutoscaler {
  private readonly maxAdjustmentRateInMilliseconds = 10000;
  private readonly adjustmentRateIncrease = 2;
  private adjustmentRateInMilliseconds = 500;
  private fps = 0;

  public static fpsTarget = 30;
  public fpsHysteresis = 5;

  constructor(private readonly renderer: Renderer) {}

  public get FPS(): number {
    return this.fps;
  }

  private deltaTimes: Array<number> = [];
  private deltaTimeSinceLastAdjustment = 0;

  /**
   * Autoscaling is also done by calling this function
   * @param deltaTimeInMilliseconds
   */
  public addDeltaTime(deltaTimeInMilliseconds: DOMHighResTimeStamp) {
    this.deltaTimes.push(deltaTimeInMilliseconds);
    this.deltaTimeSinceLastAdjustment += deltaTimeInMilliseconds;
    if (this.deltaTimeSinceLastAdjustment > this.adjustmentRateInMilliseconds) {
      this.calculateFPS();
      this.adjustQuality();
      this.adjustmentRateInMilliseconds = Math.min(
        this.maxAdjustmentRateInMilliseconds,
        this.adjustmentRateInMilliseconds * this.adjustmentRateIncrease
      );
      this.deltaTimeSinceLastAdjustment = 0;
    }
  }

  private calculateFPS() {
    const sampleCount = this.deltaTimes.length;
    this.deltaTimes.sort((a, b) => a - b);
    const ninetiethPercentile = this.deltaTimes[Math.floor(sampleCount * 0.9)];
    this.deltaTimes = [];

    this.fps = 1000 / ninetiethPercentile;
  }

  private distanceScale = 0.33;
  private lightsScale = 1;

  private adjustQuality() {
    if (this.fps >= FpsQualityAutoscaler.fpsTarget + this.fpsHysteresis) {
      this.distanceScale = this.distanceScale + 0.1;
      this.lightsScale = this.lightsScale + 0.1;
    } else if (this.fps <= FpsQualityAutoscaler.fpsTarget - this.fpsHysteresis) {
      this.distanceScale = this.distanceScale / 1.25;
      this.lightsScale = this.lightsScale / 1.5;
    }

    this.distanceScale = clamp(this.distanceScale, 0.1, 1);
    this.lightsScale = clamp(this.lightsScale, 0.2, 1);

    this.renderer.setRuntimeSettings({
      distanceRenderScale: this.distanceScale,
      lightsRenderScale: this.lightsScale,
    });
  }
}
