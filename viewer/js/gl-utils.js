function readMV(mv, mvi, nMpis, file, ind, doneCallback) {
  var rawFile = new XMLHttpRequest();
  rawFile.open("GET", file, true);
  rawFile.onreadystatechange = function () {
    if(rawFile.readyState === 4) {
      if(rawFile.status === 200 || rawFile.status == 0) {
        var txt = rawFile.responseText;
        txt = txt.split(" ");
        mv[ind] = mat4.fromValues(
          txt[0], txt[3], txt[6], 0,
          txt[1], txt[4], txt[7], 0,
          txt[2], txt[5], txt[8], 0,
          txt[9], txt[10], txt[11], 1
        );

        // Need to change axis because we rotate the temple to make "right" pointing up.
        // x -> -y
        // y -> x
        // z -> z
        //if (typeof rotate != 'undefined' && rotate == 1) {
          //var changeAxis = mat4.fromValues(
            //0.0, -1.0, 0.0, 0.0,
            //1.0, 0.0, 0.0, 0.0,
            //0.0, 0.0, 1.0, 0.0,
            //0.0, 0.0, 0.0, 1.0,
          //);
          //mat4.multiply(mv[ind], changeAxis, mv[ind]);
          //console.log("rotated (-up=right)");
        //} 

        mvi[ind] = mat4.create();
        mat4.invert(mvi[ind], mv[ind]);
        //mv[ind] = mat4.create();
        for (var i = 0; i < nMpis; i++) {
          if (mv[i] == null)
            break;
        }
        if (i == nMpis) {
          console.log("All MVs loaded.");
          doneCallback();
        }
      }
    }
  }
  rawFile.send(null);
  return 
}


function getData(image_c, image_a) {
  let canvas = document.getElementById('texturecanvas');
  let gl = canvas.getContext("webgl2");
  let texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  let data_c = new Uint8Array(image_c.width * image_c.height * 4);
  let data_a = new Uint8Array(image_a.width * image_a.height * 4);

  // Using RGB seems to cause a bug on windows, switched to RGBA
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image_c);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.readPixels(0, 0, image_c.width, image_c.height, gl.RGBA, gl.UNSIGNED_BYTE, data_c);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image_a);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.readPixels(0, 0, image_a.width, image_a.height, gl.RGBA, gl.UNSIGNED_BYTE, data_a);

  return {"data_c": data_c, "data_a": data_a};
}

function getData(img) {
  let canvas = document.getElementById('texturecanvas');
  let gl = canvas.getContext("webgl2");
  let texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  let data_c = new Uint8Array(img.width * img.height * 4);

  // Using RGB seems to cause a bug on windows, switched to RGBA
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.readPixels(0, 0, img.width, img.height, gl.RGBA, gl.UNSIGNED_BYTE, data_c);

  return data_c;
}
function getPixelsFromTexture(gl, texture, height, width){
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  var pixels = new Uint8Array(width * height * 4);
  var fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D, texture, 0
  );
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // Unbind the framebuffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return pixels;
}
function textureBasis8to6(gl, textures, height, width){
  var outputTexture = [];
  var raw_pixels = textures.map(function(texture){
    return getPixelsFromTexture(gl, texture, height, width);
  });
  //convert from 8 to 6
  var pixels_buffer = [];
  for(var i=0; i < 6; i++){
    target = new Uint8Array(height * width * 4);
    for(var j=0; j<target.length; j++){
      target[j] = 127;
    }
    pixels_buffer.push(target);
  }
  for(var i = 0; i < width * height * 4; i+=4){
    pixels_buffer[0][i] = raw_pixels[0][i];
  }
  raw_pixels.forEach(function(pixels, basisId){
    var r_i = parseInt((basisId*3 + 0) / 4);
    var g_i = parseInt((basisId*3 + 1) / 4);
    var b_i = parseInt((basisId*3 + 2) / 4);
    var r_c = (basisId*3 + 0) % 4;
    var g_c = (basisId*3 + 1) % 4;
    var b_c = (basisId*3 + 2) % 4;
    for(var i = 0; i < height * width; i++){
      var p = i*4;
      pixels_buffer[r_i][p + r_c] = pixels[p + 0];
      pixels_buffer[g_i][p + g_c] = pixels[p + 1];
      pixels_buffer[b_i][p + b_c] = pixels[p + 2];
    }
  });
  raw_pixels = null; //tell gc to remove raw pixel
  const level = 0;
  const internalFormat = gl.RGBA;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  for(var  i = 0; i < 6; i++){
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
      width, height, border, srcFormat, srcType, pixels_buffer[i]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    outputTexture.push(texture);
  }
  pixels_buffer = null; //tell gc to remove pixel buffer
  return outputTexture;
}

function loadTextureRGB(gl, url_0, url_1, url_2, callback) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  gl.getExtension('OES_texture_float');
  gl.getExtension('OES_texture_float_linear');

  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                width, height, border, srcFormat, srcType,
                null);

  const image_0 = new Image();
  const image_1 = new Image();
  const image_2 = new Image();
  image_0.crossOrigin = "anonymous";
  image_1.crossOrigin = "anonymous";
  image_2.crossOrigin = "anonymous";
  var count = 0;

  function process() {
    let data_0 = getData(image_0);
    let data_1 = getData(image_1);
    let data_2 = getData(image_2);
    
    let n = image_0.width * image_0.height * 4;
    var data_combined = new Uint8Array(n);
    let cc = 0, ca = 0;
    for (let i = 0; i < n; i += 4) {
      data_combined[i] = data_0[i];
      data_combined[i+1] = data_1[i];
      data_combined[i+2] = data_2[i];
      data_combined[i+3] = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  image_0.width, image_0.height, i,
                  srcFormat, srcType, data_combined);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    callback("Alpha");
  }

  image_0.onload = function() {
    count++;
    if (count == 3) process();
  };
  image_0.src = url_0;
  image_1.onload = function() {
    count++;
    if (count == 3) process();
  };
  image_1.src = url_1;
  image_2.onload = function() {
    count++;
    if (count == 3) process();
  };
  image_2.src = url_2;

  return texture;
}

function loadTexture2(gl, url_c, url_a) {

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.getExtension('OES_texture_float');
  gl.getExtension('OES_texture_float_linear');
  // Because images have to be download over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                width, height, border, srcFormat, srcType,
                null);

  const image_c = new Image();
  const image_a = new Image();
  image_c.crossOrigin = "anonymous";
  image_a.crossOrigin = "anonymous";
  var count = 0;

  function process() {
    var ret = getData(image_c, image_a);
    data_c = ret.data_c;
    data_a = ret.data_a;
    
    let n = image_c.width * image_c.height * 4;
    var data_combined = new Uint8Array(n);
    let cc = 0, ca = 0;
    for (let i = 0; i < n; i += 4) {
      data_combined[i] = data_c[cc++];
      data_combined[i+1] = data_c[cc++];
      data_combined[i+2] = data_c[cc++];
      data_combined[i+3] = data_a[ca];
      ca += 4;
      cc++;
    }
    console.log("aek");
    console.log(data_combined);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  image_c.width, image_c.height, i,
                  srcFormat, srcType, data_combined);

    // WebGL1 has different requirements for power of 2 images
    // vs non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (false && isPowerOf2(image.width) && isPowerOf2(image.height)) {
       // Yes, it's a power of 2. Generate mips.
       gl.generateMipmap(gl.TEXTURE_2D);
    } else {
       // No, it's not a power of 2. Turn of mips and set
       // wrapping to clamp to edge
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
       //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
       //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    console.log("done");
  }

  image_c.onload = function() {
    count++;
    if (count == 2) process();
  };
  image_c.src = url_c;
  image_a.onload = function() {
    count++;
    if (count == 2) process();
  };
  image_a.src = url_a;

  return texture;
}

function loadTexture(gl, url, callback, interpolate=gl.LINEAR) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  gl.getExtension('OES_texture_float');
  gl.getExtension('OES_texture_float_linear');
  // Because images have to be download over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  //const srcType = gl.FLOAT;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                width, height, border, srcFormat, srcType,
                null);

  const image = new Image();
  image.crossOrigin = "anonymous";

  image.onload = function() {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                  srcFormat, srcType, image);

    // WebGL1 has different requirements for power of 2 images
    // vs non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (false && isPowerOf2(image.width) && isPowerOf2(image.height)) {
       // Yes, it's a power of 2. Generate mips.
       gl.generateMipmap(gl.TEXTURE_2D);
    } else {
       // No, it's not a power of 2. Turn of mips and set
       // wrapping to clamp to edge
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, interpolate);
       gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, interpolate);
    }
    callback(url);
  };
  image.src = url;

  return texture;
}

function isPowerOf2(value) {
  return (value & (value - 1)) == 0;
}


//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object
  gl.shaderSource(shader, source);

  // Compile the shader program
  gl.compileShader(shader);

  // See if it compiled successfully
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

