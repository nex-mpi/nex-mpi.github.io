class RangeSlider {
  update() {
    this.pivot.css('top', this.piv / this.n * this.height - this.endheight * 0.5 + this.height / this.n * 0.5); 
    this.top.css('top', this.topv / this.n * this.height - this.endheight); 
    this.bottom.css('top', this.botv / this.n * this.height); 

    this.top.find(".label").html(this.n - this.topv - 1);
    this.bottom.find(".label").html(this.n - this.botv);
    this.pivot.find("#tip").html("Rotation<br>Pivot<br>(" + (this.n - this.piv - 1) + ")");

    this.dom.find(".mid")
      .css('top', this.top.position().top + this.endheight)
      .css('height', this.dom.find(".bottom").position().top - this.dom.find(".top").position().top - this.endheight);
  }

  setHeight(h) {
    this.height = h;
    this.dom.css('height', h);
  }

  constructor(dom, n, mn, mx, pv, onchange, onend) {
    this.dom = dom;
    this.drag = false;
    this.oldPos = 0;
    this.activedom = dom;
    this.height = dom.height();
    this.n = n;
    this.endheight = dom.find(".endpoint").height();
    this.top = dom.find(".top");
    this.bottom = dom.find(".bottom");
    this.mid = dom.find(".mid");
    this.pivot = dom.find(".pivot");
    this.botv = n - mn;
    this.topv = n - 1 - mx;
    this.piv = n - 1 - pv;
    this.topvo = 0;
    this.botvo = 0;
    this.pivo = 0;
    this.change = onchange;
    this.end = onend;


    this.update();
    let self = this;
    dom.find(".endpoint").mousedown(function(e) { self.activedom = $(this); });
    dom.find(".pivot").mousedown(function(e) { self.activedom = $(this); });
    dom.mousedown(function(e) {
      self.drag = true;
      self.oldPos = e.pageY;
      self.topvo = self.topv;
      self.botvo = self.botv;
      self.pivo = self.piv;
      if (!self.activedom)
        self.activedom = self.mid;
    });


    $(".pivot").mouseover(function(e) {
      if (!self.drag)
        $("#tip").show();
    });
    $(".pivot").mouseout(function(e) {
      if (!self.drag)
        $("#tip").hide();
    });

    $(document)
    .mousemove(function(e) {
      if (!self.drag) return false;
      let newp = e.pageY - self.oldPos;
      let v = Math.round(newp * self.n / self.height);
      if (self.activedom[0] == self.top[0]) {
        self.topv = self.topvo + v;
        if (self.topv >= self.botv) 
          self.topv = self.botv - 1;
        if (self.topv < 0)
          self.topv = 0;
      } else if (self.activedom[0] == self.bottom[0]) {
        self.botv = self.botvo + v;
        if (self.botv <= self.topv)
          self.botv = self.topv + 1;
        if (self.botv > self.n)
          self.botv = self.n;
      } else if (self.activedom[0] == self.pivot[0]) {
        self.piv = self.pivo + v;
        if (self.piv < 0) self.piv = 0;
        if (self.piv >= self.n) self.piv = self.n - 1;
      } else {
        if (self.topvo + v >= 0 && self.botvo + v <= self.n) {
          self.topv = self.topvo + v;
          self.botv = self.botvo + v;
        }
      }
      self.update();
      self.change(self.n-self.botv, self.n-1-self.topv, self.n-1-self.piv, self.activedom[0] == self.pivot[0]);
    })
    .mouseup(function(e) {
      self.drag = false;
      self.activedom = null;
      $("#tip").hide();
      self.end();
    });

  }
}

//$(document).ready(function() {
  //var s1 = new RangeSlider($("#s1")); 
//});
