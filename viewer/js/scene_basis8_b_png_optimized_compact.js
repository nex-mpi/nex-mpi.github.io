/*  meshroom gives out extrinsics and sfm points using opencv convention. I.e., 
 *  origin at top-left. +x goes right, +y goes down. +z looking away from the camera.
 *
 *  We create planes using this convention with POSITIVE z and create intrinsics using the same convention
 *  [f 0 px]
 *  [0 f py]
 *  [0 0 1 ]  with no negation in z.
 *
 *
 *  Now points after left multiplying with inversed intrinsics will be in the true 3d coordinates.
 *  but with x,y,z convention of opencv. This is needed because all the extrinsics are using this
 *  convention.
 *
 *  For converting back to openGL convention, we use a slightly different intrinsics:
 *  [f/(w/2)     0      px/(w/2)-1   0]
 *  [0       -f/(h/2)  -py/(h/2)-1   0]
 *  [0           0          1       -1]
 *  [0           0          1        0]
 *  I.e., this is the same except we flip the sign for y, and scale it back to normalized coordinates
 *  ranging from -1 to 1.
 *  The z-buffer will be (z-1)/z = 1 - 1/z. z is still positive. The farther z, the larger z-buffer value 
 *  which is correct.
 *
 */

class Scene {
  constructor(gl, GETscene, vivew=0, viveh=0, onReady = undefined) {
    this.gl = gl;
    this.GETscene = GETscene;
	  this.onReady = onReady;

    if (Array.isArray(planes[0])) {
      this.nPlanes = planes[0].length;
      this.planes_is_2d = true;
    } else {
      this.nPlanes = planes.length;
      this.planes_is_2d = false;
    }

    this.nMpis = names.length;
    console.log("nPlanes", this.nPlanes);
    console.log("nMpis", this.nMpis);

    this.textureLoadedCount = 0;
    this.textureTotalCount = 0;
    this.mv = new Array(this.nMpis);
    this.mvi = new Array(this.nMpis);
    this.mvLoaded = 0;
    this.baryLoaded = 0;
    this.ready = 0;
    this.delaunay = false;

    this.channel_indices = [];
    this.channel_starts = [0, Math.floor(this.nPlanes / 3), 2 * Math.floor(this.nPlanes / 3), this.nPlanes];

    for (var i = 0; i < 3; i++) {
      for (var j = this.channel_starts[i]; j < this.channel_starts[i+1]; j++) {
        this.channel_indices.push(i);
      }
    }
    //this.n_in_channel = maxcol * Math.floor(16000 / (h+2*offset));

    if (vivew > 0) {
      this.vivew = vivew;
      this.viveh = viveh;
    } else {
      this.vivew = w;
      this.viveh = h;
    }

    this.initSceneContext();
  }

  setFrameBuffer(fb){
    this.fb = fb;
  }

  resize(iw, ih) {
    const gl = this.gl;
    this.vivew = iw;
    this.viveh = ih;

    if (this.itexture) {
      gl.deleteTexture(this.itexture);
    }
    var itexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, itexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.vivew, this.viveh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.itexture = itexture;
  }

  checkReady() {
    if (this.delaunay) {
      if (this.baryLoaded == 2 && this.mvLoaded) {
        this.ready = 1;
        console.log("ready");
      }
    } else {
      this.ready = this.mvLoaded && (this.textureLoadedCount == this.textureTotalCount);
    }
  }

  initBlend() {
    console.log("initBlend()");

    var self = this;
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      document.getElementById("workspace").appendChild(canvas);
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.setAttribute("style", "margin: 0");
      self.ctxBary = canvas.getContext('2d');
      self.ctxBary.drawImage(img, 0, 0, img.width, img.height);
      self.baryLoaded ++;
      self.checkReady();

      self.pointer = document.createElement('div');
      self.pointer.setAttribute("id", "cursor");
      document.getElementById("workspace").appendChild(self.pointer);
    }
    img.crossOrigin = "anonymous";
    console.log("loading bary");
    img.src = this.GETscene + "/bary.png";

    var img2 = new Image();
    img2.onload = function() {
      var canvas = document.createElement('canvas');
      //document.getElementById("workspace").appendChild(canvas);
      canvas.width = img2.width;
      canvas.height = img2.height;
      self.ctxIndices = canvas.getContext('2d');
      self.ctxIndices.drawImage(img2, 0, 0, img2.width, img2.height);
      self.baryLoaded ++;
      self.checkReady();
    }
    img2.crossOrigin = "anonymous";
    console.log("loading indices");
    img2.src = this.GETscene + "/indices.png";


    var rawFile = new XMLHttpRequest();
    var self = this;
    rawFile.open("GET", this.GETscene + "/blend.txt", true);
    rawFile.onreadystatechange = function () {
      if(rawFile.readyState === 4) {
        if(rawFile.status === 200 || rawFile.status == 0) {
          var txt = rawFile.responseText;
          var lines = txt.split("\n");
          var v = lines[0].split(" ");
          self.center = vec3.fromValues(v[0], v[1], v[2]);
          v = lines[1].split(" ");
          self.pole = vec3.fromValues(v[0], v[1], v[2]);
          v = lines[2].split(" ");
          self.up = vec3.fromValues(v[0], v[1], v[2]);
          v = lines[3].split(" ");
          self.u = vec3.fromValues(v[0], v[1], v[2]);
          v = lines[4].split(" ");
          self.v = vec3.fromValues(v[0], v[1], v[2]);

          self.radius = parseFloat(lines[5]);
          self.shifter = parseFloat(lines[6]);
          self.scaler = parseFloat(lines[7]);

          console.log(self.center);
          console.log(self.pole);
          console.log(self.up);
          console.log(self.u);
          console.log(self.v);
          console.log(self.radius);
          console.log(self.shifter);
          console.log(self.scaler);
        }
      }
    }
    rawFile.send(null);
  }

  textureLoadedCallBack(url) {
    this.textureLoadedCount ++;
    console.log(url + " loaded");
    this.checkReady();
	  if(this.ready && this.onReady){
		  this.onReady();
	  }
  }

  initSceneContext() {
    console.log("initSceneContext()");
    this.offset = 0;
    if (typeof offset !== 'undefined') {
      this.offset = offset;
    } 

    const gl = this.gl;
    var texture_c = [], texture_b = [], texture_a = [];
    var texture_basis = [];

    var rn = Math.random();
    rn = 0;

    this.textureTotalCount = 8 + 2 + 1; // TODO: don't hard-code
    for (var i = 0; i < this.nMpis; i++) {
      texture_a.push(loadTextureRGB(gl, 
        this.GETscene + '/alpha' + names[i] + '_0.jpg?r=' + rn, 
        this.GETscene + '/alpha' + names[i] + '_1.jpg?r=' + rn, 
        this.GETscene + '/alpha' + names[i] + '_2.jpg?r=' + rn,
        this.textureLoadedCallBack.bind(this)
      ));

      texture_b.push(loadTexture(gl, this.GETscene + '/mpi' + names[i] + '_b.png?r=' + rn, this.textureLoadedCallBack.bind(this)));
      texture_c.push(loadTexture(gl, this.GETscene + '/mpi' + names[i] + '_c.jpg?r=' + rn, this.textureLoadedCallBack.bind(this)));

      var basis = [];
      for (var j = 0; j < 8; j++) {
        basis.push(loadTexture(gl, this.GETscene + '/basis_' + (j+1).toString() + '.jpg?r=' + rn, this.textureLoadedCallBack.bind(this), gl.NEAREST));
      } 
      texture_basis.push(basis);

      var realThis = this;

      if (extrinsics[i].length == 16) {
        this.mv[i] = mat4.clone(extrinsics[i]);
      } else {
        this.mv[i] = mat4.fromValues(
          extrinsics[i][0], extrinsics[i][3], extrinsics[i][6], 0,
          extrinsics[i][1], extrinsics[i][4], extrinsics[i][7], 0,
          extrinsics[i][2], extrinsics[i][5], extrinsics[i][8], 0,
          extrinsics[i][9], extrinsics[i][10], extrinsics[i][11], 1);
      }

      this.mvi[i] = mat4.create();
      mat4.invert(this.mvi[i], this.mv[i]);
    }
    if (typeof extrinsics != 'undefined') {
      this.mvLoaded = 1;
      this.checkReady();
    }

    const fb = gl.createFramebuffer();

    this.resize(this.vivew, this.viveh);

    const vsSource = `#version 300 es
    precision mediump float;

    in vec4 aVertexPosition;
    in vec2 aTextureCoord_c;
    in vec2 aTextureCoord_a;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    out highp vec2 vTextureCoord_c;
    out highp vec2 vTextureCoord_a;
    out highp vec3 vertexPos;

    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vTextureCoord_c = aTextureCoord_c;
      vTextureCoord_a = aTextureCoord_a;
      vertexPos = aVertexPosition.xyz;
    }
  `;

    var fsSource = "";
    fsSource = `#version 300 es

      precision mediump float;

      in highp vec2 vTextureCoord_c;
      in highp vec2 vTextureCoord_a;
      in highp vec3 vertexPos;


      uniform sampler2D uColor;
      uniform sampler2D uBasis;
      uniform sampler2D uAlpha;
      uniform sampler2D uBasis0;
      uniform sampler2D uBasis1;
      uniform sampler2D uBasis2;
      uniform sampler2D uBasis3;
      uniform sampler2D uBasis4;
      uniform sampler2D uBasis5;
      uniform sampler2D uBasis6;
      uniform sampler2D uBasis7;

      uniform vec3 cameraPos;

      uniform int alpha_texture_channel;
      uniform int pivot;
      out vec4 fragmentColor;

      void main(void) {
        vec4 va = texture(uAlpha, vTextureCoord_a);
        float alpha = va[alpha_texture_channel];
        if (pivot != 0) {
          fragmentColor = vec4(1.0, 0.0, 0.0, alpha);
          return ;
        }
        vec4 vc = texture(uColor, vTextureCoord_c); 
        if (alpha > 0.05) {
          vec3 view = normalize(vertexPos.xyz - cameraPos);
          float tx = view.x;
          float ty = view.y;
          float tz = view.z;
          const float rangex = 0.7;
          const float rangey = 0.6;

          vec2 loc = clamp(vec2(tx / rangex, ty / rangey) * 0.5 + 0.5, 0.0, 1.0); // range = 0 - 1;

          const float basis_width = 400.0;
          const float basis_n = 8.0;

          loc.x = loc.x * (basis_width - 1.0) / (basis_n * basis_width) + 0.5 / (basis_n * basis_width);
          loc.y = loc.y * (basis_width - 1.0) / basis_width + 0.5 / basis_width;

          vec2 shift = vec2(1.0 / basis_n, 0);

          vec4 b0 = texture(uBasis, loc              ) * 2.0 - 1.0;
          vec4 b1 = texture(uBasis, loc + shift      ) * 2.0 - 1.0;
          vec4 b2 = texture(uBasis, loc + shift * 2.0) * 2.0 - 1.0;
          vec4 b3 = texture(uBasis, loc + shift * 3.0) * 2.0 - 1.0;
          vec4 b4 = texture(uBasis, loc + shift * 4.0) * 2.0 - 1.0;
          vec4 b5 = texture(uBasis, loc + shift * 5.0) * 2.0 - 1.0;
          vec4 b6 = texture(uBasis, loc + shift * 6.0) * 2.0 - 1.0;
          vec4 b7 = texture(uBasis, loc + shift * 7.0) * 2.0 - 1.0;

          vec4 v0 = texture(uBasis0, vTextureCoord_c) * 2.0 - 1.0;
          vec4 v1 = texture(uBasis1, vTextureCoord_c) * 2.0 - 1.0;
          vec4 v2 = texture(uBasis2, vTextureCoord_c) * 2.0 - 1.0;
          vec4 v3 = texture(uBasis3, vTextureCoord_c) * 2.0 - 1.0;
          vec4 v4 = texture(uBasis4, vTextureCoord_c) * 2.0 - 1.0;
          vec4 v5 = texture(uBasis5, vTextureCoord_c) * 2.0 - 1.0;
          vec4 v6 = texture(uBasis6, vTextureCoord_c) * 2.0 - 1.0;
          vec4 v7 = texture(uBasis7, vTextureCoord_c) * 2.0 - 1.0;

          fragmentColor = vc
              + v0 * b0
              + v1 * b1
              + v2 * b2
              + v3 * b3
              + v4 * b4
              + v5 * b5
              + v6 * b6
              + v7 * b7;
          fragmentColor = clamp(fragmentColor, 0.0, 1.0);
        } else {
          fragmentColor = vc;
        }
        fragmentColor.a = alpha;            
      }
    `;

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    const programInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        textureCoord_a: gl.getAttribLocation(shaderProgram, 'aTextureCoord_a'),
        textureCoord_c: gl.getAttribLocation(shaderProgram, 'aTextureCoord_c'),
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
        cameraPos: gl.getUniformLocation(shaderProgram, 'cameraPos'),

        uColor: gl.getUniformLocation(shaderProgram, 'uColor'),
        uBasis: gl.getUniformLocation(shaderProgram, 'uBasis'),
        uAlpha: gl.getUniformLocation(shaderProgram, 'uAlpha'),
        uBasis0: gl.getUniformLocation(shaderProgram, 'uBasis0'),
        uBasis1: gl.getUniformLocation(shaderProgram, 'uBasis1'),
        uBasis2: gl.getUniformLocation(shaderProgram, 'uBasis2'),
        uBasis3: gl.getUniformLocation(shaderProgram, 'uBasis3'),
        uBasis4: gl.getUniformLocation(shaderProgram, 'uBasis4'),
        uBasis5: gl.getUniformLocation(shaderProgram, 'uBasis5'),
        uBasis6: gl.getUniformLocation(shaderProgram, 'uBasis6'),
        uBasis7: gl.getUniformLocation(shaderProgram, 'uBasis7'),
        alpha_texture_channel: gl.getUniformLocation(shaderProgram, 'alpha_texture_channel'),
        pivot: gl.getUniformLocation(shaderProgram, 'pivot'),
      },
    };


    const positionBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    
    var o2 = 2 * this.offset;
    var o = this.offset;
    var sfmProjectionMatrix = mat4.fromValues(
      f * 2 / w * (w / (w + o2)), 0, 0, 0,
      0, (f * 2 / h * (h / (h + o2))), 0, 0,
      (px + o) * 2 / (w + o2) - 1, ((py + o) * 2 / (h + o2) - 1), 1, 0,
      0, 0, 0, 1
    );

    mat4.invert(sfmProjectionMatrix, sfmProjectionMatrix);
    const positionsTmp = [
      -1, 1,  1,
      1,  1,  1, 
      1,  -1,  1,
      -1,  -1,  1,
    ];
    var positions = [];
    for (var i = 0; i < this.nPlanes; i++) {
    //for (var i = this.nPlanes - 1; i >= 0; i--) {
      for (var j = 0 ; j < 4; j++) {
        let scale = planes[0][i];
        let v = vec4.fromValues( 
            positionsTmp[j*3+0] * scale,
            positionsTmp[j*3+1] * scale,
            positionsTmp[j*3+2] * scale,
            1);
        let trans = vec4.create(); 
        vec4.transformMat4(trans, v, sfmProjectionMatrix);
        positions.push(trans[0]);
        positions.push(trans[1]);
        positions.push(trans[2]);
        positions.push(trans[3]);
      }
    }

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    var coords_c = [];
    var coords_a = [];
    var mcol;
    if (typeof maxcol == 'undefined' || maxcol == 0) 
      mcol = this.nPlanes;
    else
      mcol = maxcol;

    var mrow = Math.ceil(this.nPlanes / 3 / mcol); 

    for (var i = 0; i < this.nPlanes; i++) {
      var ii = i - this.channel_starts[this.channel_indices[i]];

      var i0 = 1.0 * (ii % mcol) / mcol;
      var i1 = 1.0 * (ii % mcol + 1) / mcol;

      var j0 = 1.0 * Math.floor(ii / mcol) / mrow;
      var j1 = 1.0 * (Math.floor(ii / mcol) + 1) / mrow;
      coords_a = coords_a.concat([
        i0, j1,
        i1, j1,
        i1, j0,
        i0, j0,
      ]);
    }

    for (var i = 0; i < layers; i++) {
      var i0 = 1.0 * (i % mcol) / mcol;
      var i1 = 1.0 * (i % mcol + 1) / mcol;

      var j0 = 1.0 * Math.floor(i / mcol) / Math.ceil(layers / mcol);
      var j1 = 1.0 * (Math.floor(i / mcol) + 1) / Math.ceil(layers / mcol);
      for (var j = 0; j < sublayers; j++) {
        coords_c = coords_c.concat([ i0, j1, i1, j1, i1, j0, i0, j0]);
      }
    }
    const textureCoord_c = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoord_c);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords_c), gl.STATIC_DRAW);

    const textureCoord_a = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoord_a);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords_a), gl.STATIC_DRAW);


    const textureUnitBuff = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureUnitBuff);
    var tc = [
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tc), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    const indicesTmp = [0, 1, 3, 2];
    var indices = [];
    for (var i = 0; i < this.nPlanes; i++) {
      for (var j = 0; j < 4; j++) {
        indices.push(indicesTmp[j] + 4 * i);
      }
    }

    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(indices), gl.STATIC_DRAW);

    if (typeof delaunay !== 'undefined' && delaunay) {
      this.delaunay = true;
      this.initBlend();
    } 

    this.gl = gl;
    this.position = positionBuffer;
    this.textureCoord_c = textureCoord_c;
    this.textureCoord_a = textureCoord_a;
    this.textureCoordUnit = textureUnitBuff;
    this.indices = indexBuffer;
    this.programInfo = programInfo;
    this.texture_a = texture_a;
    this.texture_b = texture_b;
    this.texture_c = texture_c;
    this.texture_basis = texture_basis;

    this.fb = fb;
    console.log("initSceneContext() done");
  }

  setupProgram(projectionMatrix, modelViewMatrix, cameraPos) {
    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.useProgram(programInfo.program);

    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

    gl.uniform1i(programInfo.uniformLocations.uColor, 0);
    gl.uniform1i(programInfo.uniformLocations.uAlpha, 1);
    gl.uniform1i(programInfo.uniformLocations.uBasis0, 2);
    gl.uniform1i(programInfo.uniformLocations.uBasis1, 3);
    gl.uniform1i(programInfo.uniformLocations.uBasis2, 4);
    gl.uniform1i(programInfo.uniformLocations.uBasis3, 5);
    gl.uniform1i(programInfo.uniformLocations.uBasis4, 6);
    gl.uniform1i(programInfo.uniformLocations.uBasis5, 7);
    gl.uniform1i(programInfo.uniformLocations.uBasis6, 8);
    gl.uniform1i(programInfo.uniformLocations.uBasis7, 9);
    gl.uniform1i(programInfo.uniformLocations.uBasis, 10);

    gl.uniform3fv(programInfo.uniformLocations.cameraPos, cameraPos);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoord_c);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord_c, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord_c);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoord_a);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord_a, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord_a);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.disable(gl.DEPTH_TEST);           

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_c[0]);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_a[0]);

    for (var i = 0; i < 8; i++) {
      gl.activeTexture(gl.TEXTURE2 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][i]);
    }
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_b[0]); // basis

    gl.enable( gl.BLEND );
    gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
  }

  drawPlanes(start, end) {
    const gl = this.gl;
    const programInfo = this.programInfo;
    for (var i = start; i < end; i++) {
      gl.uniform1i(programInfo.uniformLocations.alpha_texture_channel,
        this.channel_indices[this.nPlanes - 1 - i]);
      gl.uniform1i(programInfo.uniformLocations.pivot,
        this.nPlanes - 1 - i == pivoting);

      const vertexCount = 4;
      gl.drawElements(gl.TRIANGLE_STRIP, vertexCount, gl.UNSIGNED_SHORT,
        2 * vertexCount * (this.nPlanes-1-i));
    }
  }


  drawScene(postGLMatrix, projectionMatrix, eyeMatrix, cx, cy, cw, ch, clearScene, deltaTime, reuseBesti, firstPlane=-1, lastPlane=-1) {
    const gl = this.gl;
    const texture_a = this.texture_a;
    const texture_b = this.texture_b;
    const texture_c = this.texture_c;

    const itexture = this.itexture;
    const fb = this.fb;
    var modelViewMatrix = mat4.create();

    if (!projectionMatrix) {
      projectionMatrix = mat4.fromValues(
        f * dolly * 2 / w, 0, 0, 0,
        0, (f * dolly * 2 / h), 0, 0,
        px * 2 / w - 1, (py * 2 / h - 1), -1, -1,
        0, 0, -1, 0
      );
    }

    var toGL = mat4.fromValues(
      1,0,0,0,
      0,-1,0,0,
      0,0,-1,0,
      0,0,0,1);

    modelViewMatrix = toGL;

    if (postGLMatrix) 
      mat4.multiply(modelViewMatrix, postGLMatrix, modelViewMatrix);

    if (eyeMatrix) 
      mat4.multiply(modelViewMatrix, eyeMatrix, modelViewMatrix);

    var blendPlanes = this.delaunay ? 3 : Math.min(2, this.nMpis); 

    var tmp = mat4.create();
    var cameraMotion = mat4.clone(postGLMatrix);
    if (eyeMatrix) 
      mat4.multiply(cameraMotion, eyeMatrix, cameraMotion);
    mat4.invert(tmp, cameraMotion);
    var cameraPos = vec3.fromValues(tmp[12], -tmp[13], -tmp[14]); 

    if (clearScene) {
      this.setFrameBuffer(null)
      gl.clearColor(0.0, 0.0, 0.0, 1.0);  
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    var start = 0;
    var end = this.nPlanes;
    if (firstPlane != -1)
      end = this.nPlanes - firstPlane;
    if (lastPlane != -1)
      start = this.nPlanes - 1 - lastPlane;

    const mvi = this.mvi[0];

    gl.viewport(cx, cy, cw, ch);
    this.setupProgram(projectionMatrix, modelViewMatrix, cameraPos);
    this.drawPlanes(start, end);
  }

  drawSceneNoVR(modelViewMatrix, deltaTime, firstPlane=-1, lastPlane=-1) {
    this.drawScene(modelViewMatrix, null, null, 0, 0, w, h, true, deltaTime, false, firstPlane, lastPlane);
  }

}
