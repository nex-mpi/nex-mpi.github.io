// global variable that define in normal webview
// use to avoid undefined crash
var is_dolly = 0;
var dolly = 1;
var pivoting = -1;

$( document ).ready(function() {
  document.getElementById("glcanvas").remove();
  if (window.location.href.indexOf('http') == -1)
    window.location.href = (window.location.href.replace("file:///var/www/html", "http://localhost"));

  var vrDisplay = null;
  var frameData = null;
  var projectionMat = mat4.create();
  var identityMat = mat4.create();
  var vrPresentButton = null;

  // ================================
  // WebVR-specific code begins here.
  // ================================

  // WebGL setup.
  var gl = null;
  var scene = null;
  var stats = null;
  var preGL;


  var activeGPID = 0;

  // store the pose when starting program
  var headPose = null;
  var gpFirstPose = [null, null];
  var gpLastPose = [null, null];

  var currentPose = mat4.create();
  var oldPose = mat4.create();
  var oldControlState = -1;

  function onContextLost( event ) {
    event.preventDefault();
    console.log( 'WebGL Context Lost.' );
    gl = null;
    scene = null;
    stats = null;
  }

  function onContextRestored( event ) {
    console.log( 'WebGL Context Restored.' );
    initWebGL(vrDisplay ? vrDisplay.capabilities.hasExternalDisplay : false);
  }

  var webglCanvas = document.getElementById("webgl-canvas");
  webglCanvas.addEventListener( 'webglcontextlost', onContextLost, false );
  webglCanvas.addEventListener( 'webglcontextrestored', onContextRestored, false );

  var canvasClip = document.getElementById("canvas-clip");
  canvasClip.style.display = "none";

  function initWebGL (preserveDrawingBuffer) {
    console.log("init");

    var glAttribs = {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: preserveDrawingBuffer
    };
    var contextTypes = "webgl2";
    gl = webglCanvas.getContext("webgl2", glAttribs);

    if (!gl) {
      VRSamplesUtil.addError("Your browser does not support webgl2");
      return;
    }
    
    var enablePerformanceMonitoring = WGLUUrl.getBool(
      'enablePerformanceMonitoring', false);
    stats = new WGLUStats(gl, enablePerformanceMonitoring);

    gl.enable( gl.BLEND );
    gl.blendEquation( gl.FUNC_ADD );
    gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

    window.addEventListener("resize", onResize, false);
    onResize();

    scene = new Scene(gl, GETscene, webglCanvas.width / 2, webglCanvas.height);
    window.requestAnimationFrame(onCheckingStatusBar);

  }
  function onCheckingStatusBar(){
    if(!scene.ready){
      window.requestAnimationFrame(onCheckingStatusBar);
      $("#percmsg").html(scene.textureLoadedCount + " out of " + scene.textureTotalCount);
      $("#pbar").css("width", 200 * (scene.textureLoadedCount / scene.textureTotalCount) + "px");
    }else{
      $("#msg").hide();
      //display VR button
      if (vrDisplay.capabilities.canPresent)
      vrPresentButton = VRSamplesUtil.addButton("Enter VR", "E", "css/google-cardboard.png", onVRRequestPresent);

      // For the benefit of automated testing. Safe to ignore.
      if (vrDisplay.capabilities.canPresent && WGLUUrl.getBool('canvasClickPresents', false))
        webglCanvas.addEventListener("click", onVRRequestPresent, false);

      window.addEventListener('vrdisplaypresentchange', onVRPresentChange, false);
      window.addEventListener('vrdisplayactivate', onVRRequestPresent, false);
      window.addEventListener('vrdisplaydeactivate', onVRExitPresent, false);

      window.requestAnimationFrame(onAnimationFrame);
    }
  }
  function resetPose() {
    preGL = mat4.create();
    mat4.translate(preGL, preGL, [0, 0.0, -0.5]); 
    //mat4.scale(preGL, preGL, [1/planes[0], 1/planes[0], 1/planes[0]]);
    mat4.scale(preGL, preGL, [1/planes[0][0], 1/planes[0][0], 1/planes[0][0]]);
    //mat4.translate(preGL, preGL, [0, 0.0, planes[0]]); 
    mat4.translate(preGL, preGL, [0, 0.0, planes[0][0]]); 

    headPose = vrDisplay.getPose();
    var headOrigin = headPose.position;
    var headOrientation = headPose.orientation;
    headOrientation[2] = 0;
    headOrientation[0] = 0;

    mat4.fromRotationTranslation(currentPose, headOrientation, headOrigin);
    mat4.multiply(currentPose, currentPose, preGL);
  }

  function onVRRequestPresent () {
    resetPose();
    vrDisplay.requestPresent([{ source: webglCanvas }]).then(function () {
    }, function (err) {
      var errMsg = "requestPresent failed.";
      if (err && err.message) {
        errMsg += "<br/>" + err.message
      }
      VRSamplesUtil.addError(errMsg, 2000);
    });
  }

  function onVRExitPresent () {
    if (!vrDisplay.isPresenting)
      return;

    vrDisplay.exitPresent().then(function () {
    }, function () {
      VRSamplesUtil.addError("exitPresent failed.", 2000);
    });
  }

  function onVRPresentChange () {
    if (vrDisplay.isPresenting) {
      if (vrDisplay.capabilities.hasExternalDisplay) {
        VRSamplesUtil.removeButton(vrPresentButton);
        vrPresentButton = VRSamplesUtil.addButton("Exit VR", "E", "css/baseline_cancel_presentation_white_24dp.png", onVRExitPresent);
        canvasClip.classList.add("presenting");

        // Set the size to half the width and height of the eye's render
        // target. This makes the image proportional while also reducing the
        // draw costs of mirroring it to the screen.
        var leftEye = vrDisplay.getEyeParameters("left");
        canvasClip.style.width = (leftEye.renderWidth/2) + "px";
        canvasClip.style.height = (leftEye.renderHeight/2) + "px";
      }
    } else {
      if (vrDisplay.capabilities.hasExternalDisplay) {
        VRSamplesUtil.removeButton(vrPresentButton);
        vrPresentButton = VRSamplesUtil.addButton("Enter VR", "E", "css/google-cardboard.png", onVRRequestPresent);

        // Reset the div to it's default size when we're done presenting.
        canvasClip.classList.remove("presenting");
        canvasClip.style.width = "";
        canvasClip.style.height = "";
      }
    }

    // Make sure the canvas is resized AFTER we've updated the container div.
    onResize();
  }

  if (navigator.getVRDisplays) {
    frameData = new VRFrameData();
    navigator.getVRDisplays().then(function (displays) {
      if (displays.length > 0) {
        vrDisplay = displays[displays.length - 1];
        initWebGL(vrDisplay.capabilities.hasExternalDisplay);
      } else {
        //initWebGL(false);
        $("#msg").hide();
        VRSamplesUtil.addInfo("WebVR supported, but no VRDisplays found.", 3000);
      }
    }, function () {
      $("#msg").hide();
      VRSamplesUtil.addError("Your browser does not support WebVR. See <a href='http://webvr.info'>webvr.info</a> for assistance.");
    });
  } else if (navigator.getVRDevices) {
    //initWebGL(false);
    $("#msg").hide();
    VRSamplesUtil.addError("Your browser supports WebVR but not the latest version. See <a href='http://webvr.info'>webvr.info</a> for more info.");
  } else {
    //initWebGL(false);
    $("#msg").hide();
    VRSamplesUtil.addError("Your browser does not support WebVR. See <a href='http://webvr.info'>webvr.info</a> for assistance.");
  }


  function onResize () {
    console.log("resize()");
    if (vrDisplay && vrDisplay.isPresenting) {
      var leftEye = vrDisplay.getEyeParameters("left");
      var rightEye = vrDisplay.getEyeParameters("right");

      webglCanvas.width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
      webglCanvas.height = Math.max(leftEye.renderHeight, rightEye.renderHeight);
    } else {
      webglCanvas.width = webglCanvas.offsetWidth * window.devicePixelRatio;
      webglCanvas.height = webglCanvas.offsetHeight * window.devicePixelRatio;
    }
    if (scene) 
      scene.resize(webglCanvas.width * 0.5, webglCanvas.height);
  }

  // Register for mouse restricted events while in VR
  // (e.g. mouse no longer available on desktop 2D view)
  function onDisplayPointerRestricted() {
    if (webglCanvas && webglCanvas.requestPointerLock) {
      webglCanvas.requestPointerLock();
    }
  }

  // Register for mouse unrestricted events while in VR
  // (e.g. mouse once again available on desktop 2D view)
  function onDisplayPointerUnrestricted() {
    var lock = document.pointerLockElement;
    if (lock && lock === webglCanvas && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  window.addEventListener('vrdisplaypointerrestricted', onDisplayPointerRestricted);
  window.addEventListener('vrdisplaypointerunrestricted', onDisplayPointerUnrestricted);

  function copyPose(a) {
    return {orientation: vec4.clone(a.orientation), position: vec3.clone(a.position)};
  }
  function setMatrix(mat, x, y, z, t) {
    mat[0] = x[0];
    mat[1] = x[1];
    mat[2] = x[2];
    mat[3] = 0;
    mat[4] = y[0];
    mat[5] = y[1];
    mat[6] = y[2];
    mat[7] = 0;
    mat[8] = z[0];
    mat[9] = z[1];
    mat[10] = z[2];
    mat[11] = 0;
    mat[12] = t[0];
    mat[13] = t[1];
    mat[14] = t[2];
    mat[15] = 1;
  }
  function prepareModelView(vrGamepads) {
    if (vrGamepads && vrGamepads.length > 0) {
      // 0 : gamepad 0 pressed
      // 1 : gamepad 1 pressed
      // 2 : both pressed
      var controlState = -1;

      for (var i = 0; i < vrGamepads.length; i++) {
        var gp = vrGamepads[i];

        if (gp.buttons[1].pressed || gp.buttons[2].pressed) {
          if (gp.pose && gp.pose.orientation && gp.pose.position) {
            if (!gpFirstPose[i]) {
              gpFirstPose[i] = copyPose(gp.pose); 
              oldPose = mat4.clone(currentPose);
            }
            gpLastPose[i] = copyPose(gp.pose); 
            controlState += (i+1);
          }
        } else {
          gpFirstPose[i] = null;
        }
        //if (gp.buttons[1].pressed) {
        //console.log(vrDisplay.getPose().position);
        //}
      }

      if (controlState == 2 && oldControlState != 2) {
        gpFirstPose[0] = gpLastPose[0];
        gpFirstPose[1] = gpLastPose[1];
        oldPose = mat4.clone(currentPose);
      } else if (controlState >= 0 && controlState < 2 && oldControlState == 2) {
        gpFirstPose[controlState] = gpLastPose[controlState];
        oldPose = mat4.clone(currentPose);
      }


      if (controlState == 2) {
        var poseMat = mat4.create();
        var invPoseMat = mat4.create();
        var scaleMat = mat4.create();

        var gpo = quat.create();
        var gpoMat = mat4.create();

        var gpp = vec3.create();
        var diff = vec3.create();
        var up = vec3.fromValues(0, 1, 0);
        var zvec = vec3.create();
        var yvec = vec3.create();

        quat.slerp(gpo, gpFirstPose[0].orientation, gpFirstPose[1].orientation, 0.5);
        mat4.fromQuat(gpoMat, gpo);
        up = vec3.fromValues(gpoMat[4], gpoMat[5], gpoMat[6]);

        vec3.subtract(diff, gpFirstPose[1].position, gpFirstPose[0].position);
        var scale0 = vec3.length(diff);
        vec3.scale(diff, diff, 1.0 / scale0);
        vec3.cross(zvec, diff, up);
        vec3.normalize(zvec, zvec);
        vec3.cross(yvec, zvec, diff);

        vec3.lerp(gpp, gpFirstPose[0].position, gpFirstPose[1].position, 0.5);
        setMatrix(poseMat, diff, yvec, zvec, gpp);

        mat4.invert(invPoseMat, poseMat);

        quat.slerp(gpo, gpLastPose[0].orientation, gpLastPose[1].orientation, 0.5);
        mat4.fromQuat(gpoMat, gpo);
        up = vec3.fromValues(gpoMat[4], gpoMat[5], gpoMat[6]);

        vec3.subtract(diff, gpLastPose[1].position, gpLastPose[0].position);
        var scale1 = vec3.length(diff);
        vec3.scale(diff, diff, 1.0 / scale1);

        vec3.cross(zvec, diff, up);
        vec3.normalize(zvec, zvec);
        vec3.cross(yvec, zvec, diff);
        vec3.lerp(gpp, gpLastPose[0].position, gpLastPose[1].position, 0.5);
        setMatrix(poseMat, diff, yvec, zvec, gpp);

        var mult = scale1 / scale0;
        mat4.fromScaling(scaleMat, [mult, mult, mult]);

        mat4.multiply(currentPose, scaleMat, invPoseMat);
        mat4.multiply(currentPose, poseMat, currentPose);
        mat4.multiply(currentPose, currentPose, oldPose);

      } else if (controlState >= 0) {
        var id = controlState;

        var poseMat = mat4.create();
        var invPoseMat = mat4.create();
        mat4.fromRotationTranslation(poseMat, gpFirstPose[id].orientation, gpFirstPose[id].position);
        mat4.invert(invPoseMat, poseMat);

        mat4.fromRotationTranslation(poseMat, gpLastPose[id].orientation, gpLastPose[id].position);

        mat4.multiply(currentPose, poseMat, invPoseMat);
        mat4.multiply(currentPose, currentPose, oldPose);
      }

      oldControlState = controlState;

      //var gamepadMat = mat4.create();
      //getPoseMatrix(gamepadMat, vrGamepads[0].pose, true, vrDisplay);
      //mat4.rotate(gamepadMat, gamepadMat, -0.8, [1, 0, 0]);       
      //mat4.multiply(modelViewMatrix, gamepadMat, modelViewMatrix);
    }
  }

  function onAnimationFrame (t) {
    // do not attempt to render if there is no available WebGL context
    if (!gl || !stats || !scene || !scene.ready) {
      window.requestAnimationFrame(onAnimationFrame);
      return;
    }
    stats.begin();

    var vrGamepads = [];
    if (vrDisplay) {
      vrDisplay.requestAnimationFrame(onAnimationFrame);

      vrDisplay.getFrameData(frameData);

      var gamepads = navigator.getGamepads();

      for (var i = 0; i < gamepads.length; i++) {
        var gamepad = gamepads[i];
        if (gamepad && (gamepad.pose || gamepad.displayId))
          vrGamepads.push(gamepad);
      }

      prepareModelView(vrGamepads);

      if (vrDisplay.isPresenting) {
        scene.drawScene(currentPose, frameData.leftProjectionMatrix, frameData.leftViewMatrix, 0, 0, webglCanvas.width * 0.5, webglCanvas.height, true, 0, false);
        var fb = scene.drawScene(currentPose, frameData.rightProjectionMatrix, frameData.rightViewMatrix, webglCanvas.width * 0.5, 0, webglCanvas.width * 0.5, webglCanvas.height, false, 0, true);
        vrDisplay.submitFrame();
        //scene.drawScene(currentPose, frameData.leftProjectionMatrix, frameData.leftViewMatrix, 0, 0, webglCanvas.width * 0.5, webglCanvas.height, true, 0, false);
      
      } else {

        var modelViewMatrix = mat4.create();
        mat4.translate(modelViewMatrix, modelViewMatrix, [tx, ty, center + zoom]); 
        mat4.rotate(modelViewMatrix, modelViewMatrix, updown, [1, 0, 0]);      
        mat4.rotate(modelViewMatrix, modelViewMatrix, -leftright, [0, 1, 0]);  
        mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0.0, -center]); 

        mat4.perspective(projectionMat, Math.PI*0.4, webglCanvas.width/2 / webglCanvas.height, 0.1, 1024.0);

        //scene.drawScene(modelViewMatrix, null, projectionMat, null, webglCanvas.width*0.25, 0, webglCanvas.width*0.5, webglCanvas.height, 0);
        //stats.renderOrtho();
      }
    } else {
      var modelViewMatrix = mat4.create();
      mat4.translate(modelViewMatrix, modelViewMatrix, [tx, ty, center + zoom]); 
      mat4.rotate(modelViewMatrix, modelViewMatrix, updown, [1, 0, 0]);      
      mat4.rotate(modelViewMatrix, modelViewMatrix, -leftright, [0, 1, 0]);  
      mat4.translate(modelViewMatrix, modelViewMatrix, [0, 0.0, -center]); 

      //mat4.perspective(projectionMat, Math.PI*0.4, webglCanvas.width/2 / webglCanvas.height, 0.1, 1024.0);

      scene.drawScene(modelViewMatrix, identityMat, null, null, webglCanvas.width*0.25, 0, webglCanvas.width*0.5, webglCanvas.height, 0);

      //stats.renderOrtho();
    }

    stats.end();
  }


  const canvas = webglCanvas;
  var leftright = 0, updown = 0;
  var tx = 0, ty = 0;
  var zoom = 0;
  var center = planes[0][0];
  if (typeof rotationPlane != 'undefined') 
    center = rotationPlane;

  var rotation_factor = 0.3;

  var drag = false;
  var old_x, old_y;
  var dX = 0, dY = 0;

  var mouseDown = function(e) {
    drag = true;
    if (e.touches == undefined) 
      old_x = e.pageX, old_y = e.pageY;
    else
      old_x = e.touches[0].pageX, old_y = e.touches[0].pageY;
    e.preventDefault();
    return false;
  };

  var mouseUp = function(e){
    drag = false;
  };

  var mouseMove = function(e) {
    if (!drag) return false;
    
    if (e.touches == undefined) 
      mx = e.pageX, my = e.pageY;
    else
      mx = e.touches[0].pageX, my = e.touches[0].pageY;

    dX = (mx-old_x)*2*Math.PI/canvas.width,
    dY = (my-old_y)*2*Math.PI/canvas.height;

    old_x = mx, old_y = my;
    
    leftright += dX * rotation_factor;
    updown += dY * rotation_factor;

    e.preventDefault();
    //console.log(updown);
  };

  var mousewheel = function(e) {
    var e = window.event || e; // old IE support
    var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
    zoom += delta / 20.0;
    console.log(zoom);
  }

  canvas.addEventListener("mousedown", mouseDown, false);
  canvas.addEventListener("mouseup", mouseUp, false);
  canvas.addEventListener("mouseout", mouseUp, false);
  canvas.addEventListener("mousemove", mouseMove, false);
  canvas.addEventListener("mousewheel", mousewheel, false);

  canvas.addEventListener("touchstart", mouseDown, false);
  canvas.addEventListener("touchend", mouseUp, false);
  canvas.addEventListener("touchmove", mouseMove, false);

});

