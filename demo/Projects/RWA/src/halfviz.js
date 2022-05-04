//
// halfviz.js
//
// instantiates all the helper classes, sets up the particle system + renderer
// and maintains the canvas/editor splitview
//
(function () {

  trace = arbor.etc.trace
  objmerge = arbor.etc.objmerge
  objcopy = arbor.etc.objcopy
  var parse = Parseur().parse

  var HalfViz = function (elt) {
    var dom = $(elt)

    sys = arbor.ParticleSystem(2000, 1200, 0.5)
    sys.renderer = Renderer("#viewport") // our newly created renderer will have its .init() method called shortly by sys...
    sys.screenPadding(20)

    var _ed = dom.find('#editor')
    var _code = dom.find('textarea')
    var _canvas = dom.find('#viewport').get(0)
    var _grabber = dom.find('#grabber')

    var _updateTimeout = null
    var _current = null // will be the id of the doc if it's been saved before
    var _editing = false // whether to undim the Save menu and prevent navigating away
    var _failures = null

    var count = 0
    var networkList = new Array()
    var screenStep = 0.1

    var cdTimer
    var inCoolDown = false
    // var sysfps = 50
    var sysparams = sys.parameters()

    var that = {
      dashboard: Dashboard("#dashboard", sys),
      io: IO("#editor .io"),
      init: function () {

        $(window).resize(that.resize)
        that.resize()
        that.updateLayout(Math.max(1, $(window).width() - 340))

        _code.keydown(that.typing)
        _grabber.bind('mousedown', that.grabbed)

        $(document).bind('mousewheel', function (e) {
          if (inCoolDown) { return }
          inCoolDown = true
          clearTimeout(cdTimer)
          cdTimer = setTimeout(function () { inCoolDown = false }, 500)

          if (e.originalEvent.wheelDelta / 120 > 0) {
            screenStep -= Math.min(0.1 * screenStep, 0.02)
            // trace(screenStep)
            sys.screenSize($(window).width() * 10 * screenStep, $(window).height() * 10 * screenStep)
          } else {
            screenStep += Math.min(0.1 - 0.1 * screenStep, 0.02)
            // trace(screenStep)
            sys.screenSize($(window).width() * 10 * screenStep, $(window).height() * 10 * screenStep)
          }
        });

        $(document).bind('keydown', function (e) {
          if (inCoolDown) { return }
          inCoolDown = true
          clearTimeout(cdTimer)
          cdTimer = setTimeout(function () { inCoolDown = false }, 200)

          switch (e.which) {
            case 37: // left
              --count
              break
            case 38: // up
              // sys.fps(++sysfps)
              sys.start()
              break;
            case 39: // right
              ++count
              break
            case 40: // down
              // sys.fps(--sysfps)
              sysparams.repulsion = 32
              sysparams.stiffness = 8
              // sys.parameters(sysparams)
              sys.stop()
              break;
            default:
              return
          }
          $.address.value(count)
        });

        $(that.io).bind('get', that.getDoc)
        return that
      },

      getDoc: function (e) {
        if (networkList[count] == null) {
          $.get('data/' + count + '.txt', function (doc) {
            networkList[count] = parse(doc)
            that.updateGraph()
            that.resize()
            _editing = false
          })
        } else {
          that.updateGraph()
          that.resize()
          _editing = false
        }
      },

      updateGraph: function (e) {
        var network = networkList[count]
        $.each(network.nodes, function (nname, ndata) {
          if (ndata.label === undefined) ndata.label = nname
        })
        sys.merge(network)
        _updateTimeout = null
      },

      resize: function () {
        var w = $(window).width() - 40
        var x = w - _ed.width()
        that.updateLayout(x)
        sys.renderer.redraw()
      },

      updateLayout: function (split) {
        var w = dom.width()
        var h = _grabber.height()
        var split = split || _grabber.offset().left
        var splitW = _grabber.width()
        _grabber.css('left', split)

        var edW = w - split
        var edH = h
        _ed.css({ width: edW, height: edH })

        _ed.hide()
        _grabber.hide()

        var canvW = w
        var canvH = h
        _canvas.width = canvW
        _canvas.height = canvH
        sys.screenSize($(window).width() * 10 * screenStep, $(window).height() * 10 * screenStep)

        _code.css({ height: h - 20, width: edW - 4, marginLeft: 2 })
      },

      grabbed: function (e) {
        $(window).bind('mousemove', that.dragged)
        $(window).bind('mouseup', that.released)
        return false
      },
      dragged: function (e) {
        var w = dom.width()
        that.updateLayout(Math.max(10, Math.min(e.pageX - 10, w)))
        sys.renderer.redraw()
        return false
      },
      released: function (e) {
        $(window).unbind('mousemove', that.dragged)
        return false
      },
      typing: function (e) {
        var c = e.keyCode
        if ($.inArray(c, [37, 38, 39, 40, 16]) >= 0) {
          return
        }

        if (!_editing) {
          $.address.value("")
        }
        _editing = true

        if (_updateTimeout) clearTimeout(_updateTimeout)
        _updateTimeout = setTimeout(that.updateGraph, 900)
      }
    }

    return that.init()
  }


  $(document).ready(function () {
    var mcp = HalfViz("#halfviz")
  })


})()