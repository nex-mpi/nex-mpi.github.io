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
 * scene_sharedrgb.js is based off of scene5 with sharedrgb
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
  var scf = 'js/scene5.js';
  if (version == "sharedrgb")
    scf = 'js/scene_sharedrgb.js';
  else if (version == "sharedrgb2")
    scf = 'js/scene_sharedrgb2.js';
  else if (version == "phong_shared")
    scf = 'js/scene_phong_shared.js';
  else if (version == "sh2")
    scf = 'js/scene_sh2.js';
  else if (version == "sh2_op")
    scf = 'js/scene_sh2_optimized.js';
  else
    scf = 'js/scene_' + version + '.js';


  $.getScript(scf, function() {
    $.getScript(GETvr ? 'js/vrview.js' : 'js/webview_lowpower.js?v=1', function() {
    });
  });
});

//$( function() {
  //$("#rendered_planes").slider({
    //range: true,
    //min: 0,
    //max: 60,
    //values: [ 0, 60 ],
    //slide: function( event, ui ) {
      //$( "#amount" ).html(ui.values[ 0 ] + " - " + ui.values[ 1 ] );
    //}
  //});
  //$("#amount" ).html( "" + $( "#rendered_planes" ).slider( "values", 0 ) +
    //" - " + $( "#rendered_planes" ).slider( "values", 1 ) );

  ////$("#center" ).html( "" + $( "#rotation_plane" ).slider( "values", 0 ));
//} );
