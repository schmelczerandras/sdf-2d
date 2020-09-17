import Program from './program';

export class FragmentShaderOnlyProgram extends Program {
  private vao?: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext) {
    super(gl);
  }

  public async initialize(
    sources: [string, string],
    substitutions: { [name: string]: string }
  ): Promise<void> {
    await super.initialize(sources, substitutions);
    this.prepareScreenQuad('vertexPosition');
  }

  public bind() {
    super.bind();
    this.gl.bindVertexArray(this.vao!);
  }

  public draw() {
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private prepareScreenQuad(attributeName: string) {
    const positionAttributeLocation = this.gl.getAttribLocation(
      this.program!,
      attributeName
    );

    const positionBuffer = this.gl.createBuffer();

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]),
      this.gl.STATIC_DRAW
    );

    // can only return null on lost context
    this.vao = this.gl.createVertexArray()!;

    this.gl.bindVertexArray(this.vao);
    this.gl.enableVertexAttribArray(positionAttributeLocation);
    this.gl.vertexAttribPointer(positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
  }
}
