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
    this.lastBesti = [0, 0, 0];
    this.lastTi = [1, 0, 0];

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

  resize(iw, ih) {
    const gl = this.gl;
    this.vivew = iw;
    this.viveh = ih;

    if (this.itexture) {
      gl.deleteTexture(this.itexture);
    }
    var itexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, itexture);
    {
      const level = 0;
      const internalFormat = gl.RGBA;
      const border = 0;
      const format = gl.RGBA;
      const type = gl.UNSIGNED_BYTE;
      const data = null;
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
        this.vivew, this.viveh, border,
        format, type, data);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

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
    const gl = this.gl;
    var texture_c = [], texture_b = [], texture_a = [];
    var texture_basis = [];

    var rn = Math.random();
    rn = 0;

    this.textureTotalCount = 8 + 3; // TODO: don't hard-code
    for (var i = 0; i < this.nMpis; i++) {
      texture_a.push(loadTexture(gl, this.GETscene + '/mpi' + names[i] + '_a.png?r=' + rn, this.textureLoadedCallBack.bind(this)));
      texture_b.push(loadTexture(gl, this.GETscene + '/mpi' + names[i] + '_b.png?r=' + rn, this.textureLoadedCallBack.bind(this)));
      texture_c.push(loadTexture(gl, this.GETscene + '/mpi' + names[i] + '_c.png?r=' + rn, this.textureLoadedCallBack.bind(this)));

      var basis = [];
      for (var j = 0; j < 8; j++) {
        basis.push(loadTexture(gl, this.GETscene + '/basis_' + (j+1).toString() + '.png?r=' + rn, this.textureLoadedCallBack.bind(this), gl.NEAREST));
      } 
      texture_basis.push(basis);
      //var maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);

      var realThis = this;

      if (typeof extrinsics == 'undefined') {
        readMV(this.mv, this.mvi, this.nMpis, this.GETscene + "/extrinsics" + names[i] + ".txt", i, 
          function() {
            realThis.mvLoaded = 1;
            realThis.checkReady();
          });
      } else {
        if (extrinsics[i].length == 16) {
          this.mv[i] = mat4.fromValues(
            extrinsics[i][0], 
            extrinsics[i][1],
            extrinsics[i][2],
            extrinsics[i][3],
            extrinsics[i][4],
            extrinsics[i][5],
            extrinsics[i][6],
            extrinsics[i][7],
            extrinsics[i][8],
            extrinsics[i][9],
            extrinsics[i][10],
            extrinsics[i][11],
            extrinsics[i][12],
            extrinsics[i][13],
            extrinsics[i][14],
            extrinsics[i][15]);
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

    //uniform mat4 uReferenceMatrix;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat4 uSfmProjectionMatrix;
    uniform mat4 uPlaneMV;
    uniform mat4 uScale;

    out highp vec2 vTextureCoord_c;
    out highp vec2 vTextureCoord_a;
    out highp vec3 vertexPos;

    void main(void) {
      //gl_Position = uProjectionMatrix * uModelViewMatrix * uPlaneMV * uSfmProjectionMatrix * aVertexPosition;
      gl_Position = uProjectionMatrix * uModelViewMatrix * uPlaneMV * uSfmProjectionMatrix * uScale * aVertexPosition;
      vTextureCoord_c = aTextureCoord_c;
      vTextureCoord_a = aTextureCoord_a;
      
      vertexPos = (uSfmProjectionMatrix * uScale * aVertexPosition).xyz;
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
      if(true || alpha > 0.0){          
        vec4 vc = texture(uColor, vTextureCoord_c); 
        if(true || alpha > 0.05){
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
          }else{
            fragmentColor = vc;
          }
          fragmentColor.a = alpha;            
      }
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
        //referenceMatrix: gl.getUniformLocation(shaderProgram, 'uReferenceMatrix'),
        sfmProjectionMatrix: gl.getUniformLocation(shaderProgram, 'uSfmProjectionMatrix'),
        planeMV: gl.getUniformLocation(shaderProgram, 'uPlaneMV'),
        scale: gl.getUniformLocation(shaderProgram, 'uScale'),
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

    const vsSource2 = `
    attribute vec2 aTextureCoord;
    varying highp vec2 vTextureCoord;

    void main(void) {
      gl_Position = vec4(aTextureCoord.s*2.0-1.0, aTextureCoord.t * 2.0-1.0, 0.0, 1.0);
      vTextureCoord = vec2(aTextureCoord.s, aTextureCoord.t);
    }
  `;

    const fsSource2 = `
    precision mediump float;
    varying highp vec2 vTextureCoord;

    uniform sampler2D uimg0;
    uniform float t;
    uniform float sharpen;

    vec4 sharpen2D(in sampler2D tex, in vec2 coords, in vec2 renderSize, in float strength) {
      float dx = 1.0 / renderSize.x;
      float dy = 1.0 / renderSize.y;
      vec4 sum = vec4(0.0);
      sum += -1. * texture2D(tex, coords + vec2( -1.0 * dx , 0.0 * dy)) * strength;
      sum += -1. * texture2D(tex, coords + vec2( 0.0 * dx , -1.0 * dy)) * strength;
      sum += (4.0 * strength + 1.0) * texture2D(tex, coords + vec2( 0.0 * dx , 0.0 * dy));
      sum += -1. * texture2D(tex, coords + vec2( 0.0 * dx , 1.0 * dy)) * strength;
      sum += -1. * texture2D(tex, coords + vec2( 1.0 * dx , 0.0 * dy)) * strength;
      return sum;
    }

    void main(void) {
      if (sharpen == 0.0)
        gl_FragColor = texture2D(uimg0, vTextureCoord);
      else
        gl_FragColor = sharpen2D(uimg0, vTextureCoord, vec2(` + this.vivew + `, ` + this.viveh + `), sharpen);

      gl_FragColor.a = t;
    }
  `;
    const shaderProgram2 = initShaderProgram(gl, vsSource2, fsSource2);
    const programInfo2 = {
      program: shaderProgram2,
      attribLocations: {
        textureCoord: gl.getAttribLocation(shaderProgram2, 'aTextureCoord'),
      },
      uniformLocations: {
        uimg0: gl.getUniformLocation(shaderProgram2, 'uimg0'),
        t: gl.getUniformLocation(shaderProgram2, 't'),
        sharpen: gl.getUniformLocation(shaderProgram2, 'sharpen'),
      },
    };



    const positionBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    
    const positionsTmp = [
      -1, 1,  1,
      1,  1,  1, 
      1,  -1,  1,
      -1,  -1,  1,
    ];
    var positions = [];
    for (var i = 0; i < this.nPlanes; i++) {
      for (var j = 0 ; j < 4; j++) {
        positions.push(positionsTmp[j*3+0]);
        positions.push(positionsTmp[j*3+1]);
        positions.push(positionsTmp[j*3+2]);
        positions.push(1);
      }
    }
    /*
    const positionsTmp = [
      0, h + offset * 2 - 1,  1,
      w + offset * 2 - 1,  h + offset * 2 - 1,  1, 
      w + offset * 2 - 1,  0,  1,
      0,  0,  1,
    ];
    var positions = [];
    for (var i = 0; i < this.nPlanes; i++) {
      for (var j = 0 ; j < 4; j++) {
        positions.push(positionsTmp[j*3+0] * planes[0][i]);
        positions.push(positionsTmp[j*3+1] * planes[0][i]);
        positions.push(positionsTmp[j*3+2] * planes[0][i]);
        positions.push(1);
      }
    }*/

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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tc),
      gl.STATIC_DRAW);



    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    const indicesTmp = [
      0, 1, 3, 2 
    ];

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

    this.offset = 0;
    if (typeof offset !== 'undefined') {
      this.offset = offset;
    } 

    this.gl = gl;
    this.position = positionBuffer;
    this.textureCoord_c = textureCoord_c;
    this.textureCoord_a = textureCoord_a;
    this.textureCoordUnit = textureUnitBuff;
    this.indices = indexBuffer;
    this.programInfo = programInfo;
    this.programInfo2 = programInfo2;
    this.texture_a = texture_a;
    this.texture_b = texture_b;
    this.texture_c = texture_c;
    this.texture_basis = texture_basis;

    this.fb = fb;
    console.log("initSceneContext() done");
  }

  drawSubPlanes(currentPlane, texture_c, texture_a, texture_b, texture_basis, projectionMatrix, modelViewMatrix, planeMV, sfmProjectionMatrix, cw, ch, depths, atc, cameraPos, drawpivot) {
    const gl = this.gl;
    const programInfo = this.programInfo;
    gl.useProgram(programInfo.program);

    gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projectionMatrix);
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      modelViewMatrix);
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.sfmProjectionMatrix,
      false,
      sfmProjectionMatrix);
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.planeMV,
      false,
      planeMV);

    //gl.uniformMatrix4fv(
      //programInfo.uniformLocations.referenceMatrix,
      //false,
      //referenceMatrix);

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
    gl.uniform1i(programInfo.uniformLocations.alpha_texture_channel, atc);
    gl.uniform1i(programInfo.uniformLocations.pivot, drawpivot);

    {
      const numComponents = 4;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.position);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset);
      gl.enableVertexAttribArray(
        programInfo.attribLocations.vertexPosition);
    }

    // Tell WebGL how to pull out the texture coordinates from
    // the texture coordinate buffer into the textureCoord attribute.
    {
      const numComponents = 2;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoord_c);
      gl.vertexAttribPointer(
        programInfo.attribLocations.textureCoord_c,
        numComponents,
        type,
        normalize,
        stride,
        offset);
      gl.enableVertexAttribArray(
        programInfo.attribLocations.textureCoord_c);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoord_a);
      gl.vertexAttribPointer(
        programInfo.attribLocations.textureCoord_a,
        numComponents,
        type,
        normalize,
        stride,
        offset);
      gl.enableVertexAttribArray(
        programInfo.attribLocations.textureCoord_a);

    }

    {
      const numComponents = 2;
      const type = gl.FLOAT;
      const normalize = false;
      const stride = 0;
      const offset = 0;

    }

    // Tell WebGL which indices to use to index the vertices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.disable(gl.DEPTH_TEST);           

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture_c);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture_a);

    //for (var i = 0; i < 8; i++) {
      //gl.activeTexture(gl.TEXTURE2 + i);
      //gl.bindTexture(gl.TEXTURE_2D, texture_basis[0][i]);
    //}
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][0]);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][1]);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][2]);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][3]);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][4]);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][5]);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][6]);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.texture_basis[0][7]);

    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, texture_b); // basis

    const vertexCount = 4;
    const total = this.nPlanes;

    gl.enable( gl.BLEND );
    gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

    gl.viewport(0, 0, cw, ch);
    var cp = this.nPlanes - 1 - currentPlane;
    var depth = depths[cp];

    gl.uniformMatrix4fv(
      programInfo.uniformLocations.scale,
      false,
      [depth, 0, 0, 0,0, depth, 0, 0, 0, 0, depth, 0, 0, 0, 0, 1]);

    gl.drawElements(gl.TRIANGLE_STRIP, vertexCount, gl.UNSIGNED_SHORT,
      2 * vertexCount * (total-1-(currentPlane)));
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
      //f * 2 / w * (w / (w + o2)), 0, 0, 0,
      //0, (f * 2 / h * (h / (h + o2))), 0, 0,
      //(px + o) * 2 / (w + o2) - 1, ((py + o) * 2 / (h + o2) - 1), 1, 0,
        0, 0, -1, 0
      );
    }

    var o2 = 2 * this.offset;
    var o = this.offset;
    var sfmProjectionMatrix = mat4.fromValues(
      f * 2 / w * (w / (w + o2)), 0, 0, 0,
      0, (f * 2 / h * (h / (h + o2))), 0, 0,
      (px + o) * 2 / (w + o2) - 1, ((py + o) * 2 / (h + o2) - 1), 1, 0,
      //f, 0, 0, 0,
      //0, f, 0, 0,
      //px, py, 1, 0,
      0, 0, 0, 1
    );

    mat4.invert(sfmProjectionMatrix, sfmProjectionMatrix);
    //console.log(this.mv[0]);

    var toGL = mat4.fromValues(
      1,0,0,0,
      0,-1,0,0,
      0,0,-1,0,
      0,0,0,1);

    mat4.multiply(modelViewMatrix, toGL, this.mv[0]);

    if (postGLMatrix) {
      mat4.multiply(modelViewMatrix, postGLMatrix, modelViewMatrix);
    }

    if (eyeMatrix) {
      mat4.multiply(modelViewMatrix, eyeMatrix, modelViewMatrix);
    }

    var ti = null;
    var besti = [];

    var invMV = mat4.create();
    mat4.invert(invMV, modelViewMatrix);

    if (this.delaunay) {
      var newCameraCenter = vec3.fromValues(invMV[12], invMV[13], invMV[14]);
      var point = vec3.create();
      vec3.sub(point, newCameraCenter, this.center);
      vec3.scale(point, point, this.radius / vec3.len(point));
      vec3.add(point, this.center, point);

      var cp = vec3.create();
      vec3.sub(cp, this.center, this.pole);
      var pp = vec3.create();
      vec3.sub(pp, point, this.pole);

      var dcp = vec3.dot(cp, this.up);
      var dpp = vec3.dot(pp, this.up);

      var t = dcp / dpp;
      var tmp1 = vec3.create();
      vec3.sub(tmp1, point, this.pole);
      vec3.scale(tmp1, tmp1, t);
      vec3.add(tmp1, this.pole, tmp1);
      vec3.sub(tmp1, tmp1, this.center);

      var du = vec3.dot(tmp1, this.u) / this.radius * this.scaler + this.shifter;
      var dv = this.shifter - vec3.dot(tmp1, this.v) / this.radius * this.scaler;

      var bary = this.ctxBary.getImageData(du, dv, 1, 1).data;
      var indices = this.ctxIndices.getImageData(du, dv, 1, 1).data;

      if (indices[0] == 255) bary[0] = 0;
      if (indices[1] == 255) bary[1] = 0;
      if (indices[2] == 255) bary[2] = 0;

      ti = vec3.fromValues(bary[0] / 255.0, bary[1] / 255.0, bary[2] / 255.0);
      var sum = ti[0] + ti[1] + ti[2];
      if (sum > 0) {
        vec3.scale(ti, ti, 1.0 / sum);
      } 

      besti = [indices[0], indices[1], indices[2]];
      //console.log(besti);
    } else {
      var best = [1e10, 1e10];
      besti = [0, 0];
      for (var i = 0; i < this.nMpis; i++) {
        var d = 
          Math.pow(invMV[12] - this.mvi[i][12], 2) + 
          Math.pow(invMV[13] - this.mvi[i][13], 2) + 
          Math.pow(invMV[14] - this.mvi[i][14], 2);
        if (d < best[0]) {
          best[1] = best[0];
          besti[1] = besti[0];
          best[0] = d;
          besti[0] = i;
        } else if (d < best[1]) {
          best[1] = d;
          besti[1] = i;
        }
      }
      var sum = (best[0] + best[1]);
      ti = [best[1] / sum, best[0] / sum];
    }
    //console.log(besti);
    //console.log(ti);
    
    if (reuseBesti || (besti.length == 3 && besti[0] == 0 && besti[1] == 0 && besti[2] == 0)) {
      besti = this.lastBesti;
      ti = this.lastTi;
    } else {
      this.lastBesti = besti;
      this.lastTi = ti;
    }

    if (this.delaunay)
      this.pointer.setAttribute("style", "left: " + du + "px; top:" + dv + "px;");

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (clearScene) {
      gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
      //gl.clearColor(67/255.0, 67/255.0, 65/255.0, 1.0);  // Clear to black, fully opaque
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    var blendPlanes = this.delaunay ? 3 : Math.min(2, this.nMpis); 

    var tmp = mat4.create();

    var cameraMotion = mat4.clone(postGLMatrix);
    if (eyeMatrix) 
      mat4.multiply(cameraMotion, eyeMatrix, cameraMotion);
    mat4.invert(tmp, cameraMotion);
    var cameraPos = vec3.fromValues(tmp[12], -tmp[13], -tmp[14]); 

    for (var ii = 0; ii < blendPlanes; ii++) {
      if (besti[ii] == 255) continue; // Special index.
      // Draw to intermediate itexture.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, itexture, 0);
      gl.clearColor(0.0, 0.0, 0.0, 1.0);  
      //gl.clearColor(67/255.0, 67/255.0, 65/255.0, 1.0);  // Clear to black, fully opaque
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var start = 0;
      var end = this.nPlanes;
      if (firstPlane != -1)
        end = this.nPlanes - firstPlane;
      if (lastPlane != -1)
        start = this.nPlanes - 1 - lastPlane;
      for (var i = start; i < end; i++) {
        var p = (this.planes_is_2d) ? planes[besti[ii]] : planes;
        //console.log(this.mv[0]);
        //console.log(this.mvi[besti[ii]]);

        const mvi = this.mvi[besti[ii]];

        this.drawSubPlanes(i,
                           texture_c[besti[ii]],
                           texture_a[besti[ii]],
                           texture_b[besti[ii]],
                           this.texture_basis[besti[ii]],
                           projectionMatrix,
                           modelViewMatrix,
                           this.mvi[besti[ii]],
                           sfmProjectionMatrix,
                           cw, ch, p,
                           this.channel_indices[this.nPlanes - 1 - i],
                           cameraPos,
                           this.nPlanes - 1 - i == pivoting
        );
      }

      {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.textureCoordUnit);
        gl.vertexAttribPointer(
          this.programInfo2.attribLocations.textureCoord,
          numComponents,
          type,
          normalize,
          stride,
          offset);
        gl.enableVertexAttribArray(
          this.programInfo2.attribLocations.textureCoord);
      }
      gl.useProgram(this.programInfo2.program);
      gl.uniform1i(this.programInfo2.uniformLocations.uimg0, 0);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.enable( gl.BLEND );
      gl.blendFunc( gl.SRC_ALPHA, gl.ONE);
      gl.uniform1f(this.programInfo2.uniformLocations.sharpen, 0.0);
      gl.uniform1f(this.programInfo2.uniformLocations.t, ti[ii]);

      gl.viewport(cx, cy, cw, ch);
      {
        const vertexCount = 4;
        const type = gl.UNSIGNED_SHORT;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, itexture);
        gl.drawElements(gl.TRIANGLE_STRIP, vertexCount, type, 0);
      }

    }
  }

  drawSceneNoVR(modelViewMatrix, deltaTime, firstPlane=-1, lastPlane=-1) {
    this.drawScene(modelViewMatrix, null, null, 0, 0, w, h, true, deltaTime, false, firstPlane, lastPlane);
  }

}
