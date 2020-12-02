var getUrlParameter = function getUrlParameter(sParam) {
  var sPageURL = window.location.search.substring(1),
    sURLVariables = sPageURL.split('&'),
    sParameterName,
    i;

  for (i = 0; i < sURLVariables.length; i++) {
    sParameterName = sURLVariables[i].split('=');

    if (sParameterName[0] === sParam) {
      return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1]);
    }
  }
};


function UrlExists(url) {
  var http = new XMLHttpRequest();
  try {
    http.open('HEAD', url, false);
    http.send();
    return http.status!=404;
  } catch (err) {
    return false;
  }
}

/* scene.js is simple mpi rendering
 * scene3.js is mpi with sublayers
 * scene4.js is for temple360 with multiple planes config
 * scene5.js is scene4.js cleaned up.
 */

var GETscene = getUrlParameter('scene');
var GETvr = getUrlParameter('vr');
var GETversion = getUrlParameter('ver');

if (GETscene.indexOf("cs://") != -1) {
  for (var i = 111; i <= 114; i++) {
    var newUrl = GETscene.replace("cs://", "http://10.204.100." + i.toString(10) + "/")
    if (UrlExists(newUrl + "/config.js")) {
      GETscene = newUrl; 
      break;
    }
  }
}
$("#scenename").html(GETscene);

$.getScript(GETscene + '/config.js', function() {
  var scf = 'js/scene.js';
  if (GETversion == '3' || GETversion == '4' || GETversion == '5')
    scf = 'js/scene' + GETversion + '.js';
    
  $.getScript(scf, function() {
    $.getScript(GETvr ? 'js/vrview.js' : 'js/webview.js', function() {
    });
  });
});
