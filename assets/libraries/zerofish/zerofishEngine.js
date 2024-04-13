var zerofish = (()=>{
  var _scriptDir = import.meta.url;

  return (function(moduleArg={}) {

      function aa() {
          f.buffer != l.buffer && p();
          return l
      }
      function q() {
          f.buffer != l.buffer && p();
          return ba
      }
      function r() {
          f.buffer != l.buffer && p();
          return ca
      }
      function w() {
          f.buffer != l.buffer && p();
          return da
      }
      function ea() {
          f.buffer != l.buffer && p();
          return fa
      }
      var y = moduleArg, ha, z, readyPromise = new Promise((a,b)=>{
          ha = a;
          z = b
      }
      );
      y.listenFish = a=>console.log("fish:", a);
      y.listenZero = a=>console.log("zero:", a);
      y.zero = a=>y.uci(a, !1);
      y.fish = a=>y.uci(a, !0);
      y.uci = (a,b)=>{
          const c = A(a) + 1
            , e = ia(c);
          if (!e)
              throw Error(`Could not allocate ${c} bytes`);
          B(a, e, c);
          ja(e, b);
          ka(e)
      }
      ;
      y.setZeroWeights = a=>{
          const b = ia(a.byteLength);
          if (!b)
              throw Error(`Could not allocate ${a.byteLength} bytes`);
          y.HEAPU8.set(a, b);
          la(b, a.byteLength)
      }
      ;
      y.print = a=>{
          a.startsWith("zero:") ? y.listenZero(a.slice(5)) : a.startsWith("fish:") ? y.listenFish(a.slice(5)) : console.info(a)
      }
      ;
      y.printErr = a=>console.error(a);
      var ma = Object.assign({}, y), na = "object" == typeof window, C = "function" == typeof importScripts, oa = "object" == typeof process && "object" == typeof process.Ga && "string" == typeof process.Ga.node, D = y.ENVIRONMENT_IS_PTHREAD || !1, E = "", pa;
      if (na || C)
          C ? E = self.location.href : "undefined" != typeof document && document.currentScript && (E = document.currentScript.src),
          _scriptDir && (E = _scriptDir),
          E.startsWith("blob:") ? E = "" : E = E.substr(0, E.replace(/[?#].*/, "").lastIndexOf("/") + 1),
          C && (pa = a=>{
              var b = new XMLHttpRequest;
              b.open("GET", a, !1);
              b.responseType = "arraybuffer";
              b.send(null);
              return new Uint8Array(b.response)
          }
          );
      var qa = y.print || console.log.bind(console)
        , F = y.printErr || console.error.bind(console);
      Object.assign(y, ma);
      ma = null;
      var f, ra, H = !1, I, l, ba, ca, da, fa;
      function p() {
          var a = f.buffer;
          y.HEAP8   = l  = new Int8Array(a);
          y.HEAPU8  = ba = new Uint8Array(a);
          y.HEAP16       = new Int16Array(a);
          y.HEAPU16      = new Uint16Array(a);
          y.HEAP32  = ca = new Int32Array(a);
          y.HEAPU32 = da = new Uint32Array(a);
          y.HEAPF32      = new Float32Array(a);
          y.HEAPF64 = fa = new Float64Array(a);
      }
      var sa = 268435456;
      if (D)
          f = y.wasmMemory;
      else if (y.wasmMemory)
          f = y.wasmMemory;
      else if (f = new WebAssembly.Memory({
          initial: sa / 65536,
          maximum: 32768,
          shared: !0
      }),
      !(f.buffer instanceof SharedArrayBuffer))
          throw F("requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag"),
          oa && F("(on node you may need: --experimental-wasm-threads --experimental-wasm-bulk-memory and/or recent version)"),
          Error("bad memory");
      p();
      sa = f.buffer.byteLength;
      var ta = []
        , ua = []
        , va = []
        , wa = []
        , xa = []
        , ya = !1
        , J = 0
        , za = null
        , K = null;
      function Aa() {
          J--;
          if (0 == J && (null !== za && (clearInterval(za),
          za = null),
          K)) {
              var a = K;
              K = null;
              a()
          }
      }
      function L(a) {
          a = "Aborted(" + a + ")";
          F(a);
          H = !0;
          I = 1;
          a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
          z(a);
          throw a;
      }
      var Ba = a=>a.startsWith("data:application/octet-stream;base64,"), M;
      y.locateFile ? (M = "zerofishEngine.wasm",
      Ba(M) || (M = E + M)) : M = (new URL("zerofishEngine.wasm",import.meta.url)).href;
      function Ca(a) {
          if (pa)
              return pa(a);
          throw "both async and sync fetching of the wasm failed";
      }
      function Da(a) {
          return (na || C) && "function" == typeof fetch ? fetch(a, {
              credentials: "same-origin"
          }).then(b=>{
              if (!b.ok)
                  throw `failed to load wasm binary file at '${a}'`;
              return b.arrayBuffer()
          }
          ).catch(()=>Ca(a)) : Promise.resolve().then(()=>Ca(a))
      }
      function Ea(a, b, c) {
          return Da(a).then(e=>WebAssembly.instantiate(e, b)).then(c, e=>{
              F(`failed to asynchronously prepare wasm: ${e}`);
              L(e)
          }
          )
      }
      function Fa(a, b) {
          var c = M;
          return "function" != typeof WebAssembly.instantiateStreaming || Ba(c) || "function" != typeof fetch ? Ea(c, a, b) : fetch(c, {
              credentials: "same-origin"
          }).then(e=>WebAssembly.instantiateStreaming(e, a).then(b, function(h) {
              F(`wasm streaming compile failed: ${h}`);
              F("falling back to ArrayBuffer instantiation");
              return Ea(c, a, b)
          }))
      }
      function Ga(a) {
          this.name = "ExitStatus";
          this.message = `Program terminated with exit(${a})`;
          this.status = a
      }
      var Ha = a=>{
          a.terminate();
          a.onmessage = ()=>{}
      }
        , Ja = a=>{
          0 == P.fa.length && (Ia(),
          P.qa(P.fa[0]));
          var b = P.fa.pop();
          if (!b)
              return 6;
          P.ha.push(b);
          P.ca[a.ga] = b;
          b.ga = a.ga;
          b.postMessage({
              cmd: "run",
              start_routine: a.Aa,
              arg: a.wa,
              pthread_ptr: a.ga
          }, a.Fa);
          return 0
      }
        , Q = 0
        , Ka = ()=>0 < Q
        , Na = a=>{
          var b = La();
          a = a();
          Ma(b);
          return a
      }
        , R = (a,b,...c)=>Na(()=>{
          for (var e = c.length, h = Oa(8 * e), g = h >> 3, k = 0; k < c.length; k++) {
              var u = c[k];
              ea()[g + k] = u
          }
          return Pa(a, 0, e, h, b)
      }
      );
      function Qa(a) {
          if (D)
              return R(0, 1, a);
          I = a;
          0 < Q || (P.ta(),
          H = !0);
          throw new Ga(a);
      }
      var T = a=>{
          I = a;
          if (D)
              throw Ra(a),
              "unwind";
          0 < Q || D || (Sa(),
          S(wa),
          Ta(0),
          Ua[1].length && Va(1, 10),
          Ua[2].length && Va(2, 10),
          P.ta(),
          ya = !0);
          Qa(a)
      }
        , Wa = a=>{
          if (!(a instanceof Ga || "unwind" == a))
              throw a;
      }
      ;
      function Xa() {
          for (var a = 8; a--; )
              Ia();
          ta.unshift(()=>{
              J++;
              Ya(()=>Aa())
          }
          )
      }
      function Ia() {
          var a = y.locateFile ? new Worker(E + "zerofishEngine.worker.js",{
              type: "module"
          }) : new Worker(new URL("zerofishEngine.worker.js",import.meta.url),{
              type: "module"
          });
          P.fa.push(a)
      }
      function Ya(a) {
          D ? a() : Promise.all(P.fa.map(P.qa)).then(a)
      }
      var P = {
          fa: [],
          ha: [],
          va: [],
          ca: {},
          na() {
              D ? (P.receiveObjectTransfer = P.za,
              P.threadInitTLS = P.ua,
              P.setExitStatus = P.sa) : Xa()
          },
          sa: a=>I = a,
          La: ["$terminateWorker"],
          ta: ()=>{
              for (var a of P.ha)
                  Ha(a);
              for (a of P.fa)
                  Ha(a);
              P.fa = [];
              P.ha = [];
              P.ca = []
          }
          ,
          ra: a=>{
              var b = a.ga;
              delete P.ca[b];
              P.fa.push(a);
              P.ha.splice(P.ha.indexOf(a), 1);
              a.ga = 0;
              Za(b)
          }
          ,
          za() {},
          ua() {
              P.va.forEach(a=>a())
          },
          qa: a=>new Promise(b=>{
              a.onmessage = g=>{
                  g = g.data;
                  var k = g.cmd;
                  if (g.targetThread && g.targetThread != U()) {
                      var u = P.ca[g.targetThread];
                      u ? u.postMessage(g, g.transferList) : F(`Internal error! Worker sent a message "${k}" to target pthread ${g.targetThread}, but that thread no longer exists!`)
                  } else if ("checkMailbox" === k)
                      V();
                  else if ("spawnThread" === k)
                      Ja(g);
                  else if ("cleanupThread" === k)
                      P.ra(P.ca[g.thread]);
                  else if ("killThread" === k)
                      g = g.thread,
                      k = P.ca[g],
                      delete P.ca[g],
                      Ha(k),
                      Za(g),
                      P.ha.splice(P.ha.indexOf(k), 1),
                      k.ga = 0;
                  else if ("cancelThread" === k)
                      P.ca[g.thread].postMessage({
                          cmd: "cancel"
                      });
                  else if ("loaded" === k)
                      a.loaded = !0,
                      b(a);
                  else if ("alert" === k)
                      alert(`Thread ${g.threadId}: ${g.text}`);
                  else if ("setimmediate" === g.target)
                      a.postMessage(g);
                  else if ("callHandler" === k)
                      y[g.handler](...g.args);
                  else
                      k && F(`worker sent an unknown command ${k}`)
              }
              ;
              a.onerror = g=>{
                  F(`${"worker sent an error!"} ${g.filename}:${g.lineno}: ${g.message}`);
                  throw g;
              }
              ;
              var c = [], e = ["print", "printErr"], h;
              for (h of e)
                  y.hasOwnProperty(h) && c.push(h);
              a.postMessage({
                  cmd: "load",
                  handlers: c,
                  urlOrBlob: y.mainScriptUrlOrBlob,
                  wasmMemory: f,
                  wasmModule: ra
              })
          }
          )
      };
      y.PThread = P;
      var S = a=>{
          for (; 0 < a.length; )
              a.shift()(y)
      }
      ;
      y.establishStackSpace = ()=>{
          var a = U()
            , b = w()[a + 52 >> 2];
          a = w()[a + 56 >> 2];
          $a(b, b - a);
          Ma(b)
      }
      ;
      function Ra(a) {
          if (D)
              return R(1, 0, a);
          --Q;
          T(a)
      }
      var W = [], ab;
      y.invokeEntryPoint = (a,b)=>{
          Q = 0;
          var c = W[a];
          c || (a >= W.length && (W.length = a + 1),
          W[a] = c = ab.get(a));
          a = c(b);
          0 < Q ? P.sa(a) : bb(a)
      }
      ;
      class cb {
          constructor(a) {
              this.ma = a - 24
          }
          na(a, b) {
              w()[this.ma + 16 >> 2] = 0;
              w()[this.ma + 4 >> 2] = a;
              w()[this.ma + 8 >> 2] = b
          }
      }
      var db = 0
        , eb = 0;
      function fb(a, b, c, e) {
          return D ? R(2, 1, a, b, c, e) : gb(a, b, c, e)
      }
      var gb = (a,b,c,e)=>{
          if ("undefined" == typeof SharedArrayBuffer)
              return F("Current environment does not support SharedArrayBuffer, pthreads are not available!"),
              6;
          var h = [];
          if (D && 0 === h.length)
              return fb(a, b, c, e);
          a = {
              Aa: c,
              ga: a,
              wa: e,
              Fa: h
          };
          return D ? (a.Ja = "spawnThread",
          postMessage(a, h),
          0) : Ja(a)
      }
        , hb = "undefined" != typeof TextDecoder ? new TextDecoder("utf8") : void 0
        , ib = (a,b)=>{
          for (var c = b + NaN, e = b; a[e] && !(e >= c); )
              ++e;
          if (16 < e - b && a.buffer && hb)
              return hb.decode(a.buffer instanceof SharedArrayBuffer ? a.slice(b, e) : a.subarray(b, e));
          for (c = ""; b < e; ) {
              var h = a[b++];
              if (h & 128) {
                  var g = a[b++] & 63;
                  if (192 == (h & 224))
                      c += String.fromCharCode((h & 31) << 6 | g);
                  else {
                      var k = a[b++] & 63;
                      h = 224 == (h & 240) ? (h & 15) << 12 | g << 6 | k : (h & 7) << 18 | g << 12 | k << 6 | a[b++] & 63;
                      65536 > h ? c += String.fromCharCode(h) : (h -= 65536,
                      c += String.fromCharCode(55296 | h >> 10, 56320 | h & 1023))
                  }
              } else
                  c += String.fromCharCode(h)
          }
          return c
      }
        , jb = a=>a ? ib(q(), a) : "";
      function kb(a, b, c) {
          return D ? R(3, 1, a, b, c) : 0
      }
      function lb(a, b, c) {
          return D ? R(4, 1, a, b, c) : 0
      }
      function mb(a, b, c, e) {
          if (D)
              return R(5, 1, a, b, c, e)
      }
      var nb = a=>{
          "function" === typeof Atomics.Ha && (Atomics.Ha(r(), a >> 2, a).value.then(V),
          a += 128,
          Atomics.store(r(), a >> 2, 1))
      }
      ;
      y.__emscripten_thread_mailbox_await = nb;
      var V = ()=>{
          var a = U();
          if (a && (nb(a),
          a = ob,
          !ya && !H))
              try {
                  if (a(),
                  !(ya || 0 < Q))
                      try {
                          D ? bb(I) : T(I)
                      } catch (b) {
                          Wa(b)
                      }
              } catch (b) {
                  Wa(b)
              }
      }
      ;
      y.checkMailbox = V;
      var pb = [], X = a=>0 === a % 4 && (0 !== a % 100 || 0 === a % 400), qb = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], rb = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], tb = (a,b,c,e)=>{
          if (!(0 < e))
              return 0;
          var h = c;
          e = c + e - 1;
          for (var g = 0; g < a.length; ++g) {
              var k = a.charCodeAt(g);
              if (55296 <= k && 57343 >= k) {
                  var u = a.charCodeAt(++g);
                  k = 65536 + ((k & 1023) << 10) | u & 1023
              }
              if (127 >= k) {
                  if (c >= e)
                      break;
                  b[c++] = k
              } else {
                  if (2047 >= k) {
                      if (c + 1 >= e)
                          break;
                      b[c++] = 192 | k >> 6
                  } else {
                      if (65535 >= k) {
                          if (c + 2 >= e)
                              break;
                          b[c++] = 224 | k >> 12
                      } else {
                          if (c + 3 >= e)
                              break;
                          b[c++] = 240 | k >> 18;
                          b[c++] = 128 | k >> 12 & 63
                      }
                      b[c++] = 128 | k >> 6 & 63
                  }
                  b[c++] = 128 | k & 63
              }
          }
          b[c] = 0;
          return c - h
      }
      , B = (a,b,c)=>tb(a, q(), b, c), Y = a=>{
          Y.oa || (Y.oa = {});
          Y.oa[a] || (Y.oa[a] = 1,
          F(a))
      }
      , A = a=>{
          for (var b = 0, c = 0; c < a.length; ++c) {
              var e = a.charCodeAt(c);
              127 >= e ? b++ : 2047 >= e ? b += 2 : 55296 <= e && 57343 >= e ? (b += 4,
              ++c) : b += 3
          }
          return b
      }
      , ub = {}, wb = ()=>{
          if (!vb) {
              var a = {
                  USER: "web_user",
                  LOGNAME: "web_user",
                  PATH: "/",
                  PWD: "/",
                  HOME: "/home/web_user",
                  LANG: ("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8",
                  _: "./this.program"
              }, b;
              for (b in ub)
                  void 0 === ub[b] ? delete a[b] : a[b] = ub[b];
              var c = [];
              for (b in a)
                  c.push(`${b}=${a[b]}`);
              vb = c
          }
          return vb
      }
      , vb;
      function xb(a, b) {
          if (D)
              return R(6, 1, a, b);
          var c = 0;
          wb().forEach((e,h)=>{
              var g = b + c;
              h = w()[a + 4 * h >> 2] = g;
              for (g = 0; g < e.length; ++g)
                  aa()[h++] = e.charCodeAt(g);
              aa()[h] = 0;
              c += e.length + 1
          }
          );
          return 0
      }
      function yb(a, b) {
          if (D)
              return R(7, 1, a, b);
          var c = wb();
          w()[a >> 2] = c.length;
          var e = 0;
          c.forEach(h=>e += h.length + 1);
          w()[b >> 2] = e;
          return 0
      }
      function zb(a) {
          return D ? R(8, 1, a) : 52
      }
      function Ab(a, b, c, e) {
          return D ? R(9, 1, a, b, c, e) : 52
      }
      function Bb(a, b, c, e, h) {
          return D ? R(10, 1, a, b, c, e, h) : 70
      }
      var Ua = [null, [], []]
        , Va = (a,b)=>{
          var c = Ua[a];
          0 === b || 10 === b ? ((1 === a ? qa : F)(ib(c, 0)),
          c.length = 0) : c.push(b)
      }
      ;
      function Cb(a, b, c, e) {
          if (D)
              return R(11, 1, a, b, c, e);
          for (var h = 0, g = 0; g < c; g++) {
              var k = w()[b >> 2]
                , u = w()[b + 4 >> 2];
              b += 8;
              for (var v = 0; v < u; v++)
                  Va(a, q()[k + v]);
              h += u
          }
          w()[e >> 2] = h;
          return 0
      }
      var Db = ()=>{
          if ("object" == typeof crypto && "function" == typeof crypto.getRandomValues)
              return a=>(a.set(crypto.getRandomValues(new Uint8Array(a.byteLength))),
              a);
          L("initRandomDevice")
      }
        , Eb = a=>(Eb = Db())(a)
        , Fb = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        , Gb = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      function Hb(a) {
          var b = Array(A(a) + 1);
          tb(a, b, 0, b.length);
          return b
      }
      var Ib = (a,b)=>{
          aa().set(a, b)
      }
        , Jb = (a,b,c,e)=>{
          function h(d, m, t) {
              for (d = "number" == typeof d ? d.toString() : d || ""; d.length < m; )
                  d = t[0] + d;
              return d
          }
          function g(d, m) {
              return h(d, m, "0")
          }
          function k(d, m) {
              function t(sb) {
                  return 0 > sb ? -1 : 0 < sb ? 1 : 0
              }
              var G;
              0 === (G = t(d.getFullYear() - m.getFullYear())) && 0 === (G = t(d.getMonth() - m.getMonth())) && (G = t(d.getDate() - m.getDate()));
              return G
          }
          function u(d) {
              switch (d.getDay()) {
              case 0:
                  return new Date(d.getFullYear() - 1,11,29);
              case 1:
                  return d;
              case 2:
                  return new Date(d.getFullYear(),0,3);
              case 3:
                  return new Date(d.getFullYear(),0,2);
              case 4:
                  return new Date(d.getFullYear(),0,1);
              case 5:
                  return new Date(d.getFullYear() - 1,11,31);
              case 6:
                  return new Date(d.getFullYear() - 1,11,30)
              }
          }
          function v(d) {
              var m = d.ia;
              for (d = new Date((new Date(d.ja + 1900,0,1)).getTime()); 0 < m; ) {
                  var t = d.getMonth()
                    , G = (X(d.getFullYear()) ? Fb : Gb)[t];
                  if (m > G - d.getDate())
                      m -= G - d.getDate() + 1,
                      d.setDate(1),
                      11 > t ? d.setMonth(t + 1) : (d.setMonth(0),
                      d.setFullYear(d.getFullYear() + 1));
                  else {
                      d.setDate(d.getDate() + m);
                      break
                  }
              }
              t = new Date(d.getFullYear() + 1,0,4);
              m = u(new Date(d.getFullYear(),0,4));
              t = u(t);
              return 0 >= k(m, d) ? 0 >= k(t, d) ? d.getFullYear() + 1 : d.getFullYear() : d.getFullYear() - 1
          }
          var n = w()[e + 40 >> 2];
          e = {
              Da: r()[e >> 2],
              Ca: r()[e + 4 >> 2],
              ka: r()[e + 8 >> 2],
              pa: r()[e + 12 >> 2],
              la: r()[e + 16 >> 2],
              ja: r()[e + 20 >> 2],
              ea: r()[e + 24 >> 2],
              ia: r()[e + 28 >> 2],
              Ma: r()[e + 32 >> 2],
              Ba: r()[e + 36 >> 2],
              Ea: n ? jb(n) : ""
          };
          c = jb(c);
          n = {
              "%c": "%a %b %d %H:%M:%S %Y",
              "%D": "%m/%d/%y",
              "%F": "%Y-%m-%d",
              "%h": "%b",
              "%r": "%I:%M:%S %p",
              "%R": "%H:%M",
              "%T": "%H:%M:%S",
              "%x": "%m/%d/%y",
              "%X": "%H:%M:%S",
              "%Ec": "%c",
              "%EC": "%C",
              "%Ex": "%m/%d/%y",
              "%EX": "%H:%M:%S",
              "%Ey": "%y",
              "%EY": "%Y",
              "%Od": "%d",
              "%Oe": "%e",
              "%OH": "%H",
              "%OI": "%I",
              "%Om": "%m",
              "%OM": "%M",
              "%OS": "%S",
              "%Ou": "%u",
              "%OU": "%U",
              "%OV": "%V",
              "%Ow": "%w",
              "%OW": "%W",
              "%Oy": "%y"
          };
          for (var x in n)
              c = c.replace(new RegExp(x,"g"), n[x]);
          var N = "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" ")
            , O = "January February March April May June July August September October November December".split(" ");
          n = {
              "%a": d=>N[d.ea].substring(0, 3),
              "%A": d=>N[d.ea],
              "%b": d=>O[d.la].substring(0, 3),
              "%B": d=>O[d.la],
              "%C": d=>g((d.ja + 1900) / 100 | 0, 2),
              "%d": d=>g(d.pa, 2),
              "%e": d=>h(d.pa, 2, " "),
              "%g": d=>v(d).toString().substring(2),
              "%G": v,
              "%H": d=>g(d.ka, 2),
              "%I": d=>{
                  d = d.ka;
                  0 == d ? d = 12 : 12 < d && (d -= 12);
                  return g(d, 2)
              }
              ,
              "%j": d=>{
                  for (var m = 0, t = 0; t <= d.la - 1; m += (X(d.ja + 1900) ? Fb : Gb)[t++])
                      ;
                  return g(d.pa + m, 3)
              }
              ,
              "%m": d=>g(d.la + 1, 2),
              "%M": d=>g(d.Ca, 2),
              "%n": ()=>"\n",
              "%p": d=>0 <= d.ka && 12 > d.ka ? "AM" : "PM",
              "%S": d=>g(d.Da, 2),
              "%t": ()=>"\t",
              "%u": d=>d.ea || 7,
              "%U": d=>g(Math.floor((d.ia + 7 - d.ea) / 7), 2),
              "%V": d=>{
                  var m = Math.floor((d.ia + 7 - (d.ea + 6) % 7) / 7);
                  2 >= (d.ea + 371 - d.ia - 2) % 7 && m++;
                  if (m)
                      53 == m && (t = (d.ea + 371 - d.ia) % 7,
                      4 == t || 3 == t && X(d.ja) || (m = 1));
                  else {
                      m = 52;
                      var t = (d.ea + 7 - d.ia - 1) % 7;
                      (4 == t || 5 == t && X(d.ja % 400 - 1)) && m++
                  }
                  return g(m, 2)
              }
              ,
              "%w": d=>d.ea,
              "%W": d=>g(Math.floor((d.ia + 7 - (d.ea + 6) % 7) / 7), 2),
              "%y": d=>(d.ja + 1900).toString().substring(2),
              "%Y": d=>d.ja + 1900,
              "%z": d=>{
                  d = d.Ba;
                  var m = 0 <= d;
                  d = Math.abs(d) / 60;
                  return (m ? "+" : "-") + String("0000" + (d / 60 * 100 + d % 60)).slice(-4)
              }
              ,
              "%Z": d=>d.Ea,
              "%%": ()=>"%"
          };
          c = c.replace(/%%/g, "\x00\x00");
          for (x in n)
              c.includes(x) && (c = c.replace(new RegExp(x,"g"), n[x](e)));
          c = c.replace(/\0\0/g, "%");
          x = Hb(c);
          if (x.length > b)
              return 0;
          Ib(x, a);
          return x.length - 1
      }
      ;
      P.na();
      var Kb = [Qa, Ra, fb, kb, lb, mb, xb, yb, zb, Ab, Bb, Cb]
        , Mb = {
          b: (a,b,c)=>{
              (new cb(a)).na(b, c);
              db = a;
              eb++;
              throw db;
          }
          ,
          k: a=>{
              Lb(a, !C, 1, !na, 1048576, !1);
              P.ua()
          }
          ,
          h: a=>{
              D ? postMessage({
                  cmd: "cleanupThread",
                  thread: a
              }) : P.ra(P.ca[a])
          }
          ,
          D: gb,
          g: kb,
          v: lb,
          w: mb,
          F: ()=>1,
          C: (a,b)=>{
              a == b ? setTimeout(V) : D ? postMessage({
                  targetThread: a,
                  cmd: "checkMailbox"
              }) : (a = P.ca[a]) && a.postMessage({
                  cmd: "checkMailbox"
              })
          }
          ,
          E: (a,b,c,e,h)=>{
              pb.length = e;
              b = h >> 3;
              for (h = 0; h < e; h++)
                  pb[h] = ea()[b + h];
              a = Kb[a];
              P.ya = c;
              c = a(...pb);
              P.ya = 0;
              return c
          }
          ,
          j: nb,
          e: ()=>{}
          ,
          o: function(a, b, c) {
              a = new Date(1E3 * (b + 2097152 >>> 0 < 4194305 - !!a ? (a >>> 0) + 4294967296 * b : NaN));
              r()[c >> 2] = a.getSeconds();
              r()[c + 4 >> 2] = a.getMinutes();
              r()[c + 8 >> 2] = a.getHours();
              r()[c + 12 >> 2] = a.getDate();
              r()[c + 16 >> 2] = a.getMonth();
              r()[c + 20 >> 2] = a.getFullYear() - 1900;
              r()[c + 24 >> 2] = a.getDay();
              b = (X(a.getFullYear()) ? qb : rb)[a.getMonth()] + a.getDate() - 1 | 0;
              r()[c + 28 >> 2] = b;
              r()[c + 36 >> 2] = -(60 * a.getTimezoneOffset());
              b = (new Date(a.getFullYear(),6,1)).getTimezoneOffset();
              var e = (new Date(a.getFullYear(),0,1)).getTimezoneOffset();
              a = (b != e && a.getTimezoneOffset() == Math.min(e, b)) | 0;
              r()[c + 32 >> 2] = a
          },
          B: (a,b,c,e)=>{
              var h = (new Date).getFullYear()
                , g = new Date(h,0,1)
                , k = new Date(h,6,1);
              h = g.getTimezoneOffset();
              var u = k.getTimezoneOffset()
                , v = Math.max(h, u);
              w()[a >> 2] = 60 * v;
              r()[b >> 2] = Number(h != u);
              a = n=>n.toLocaleTimeString(void 0, {
                  hour12: !1,
                  timeZoneName: "short"
              }).split(" ")[1];
              g = a(g);
              k = a(k);
              u < h ? (B(g, c, 17),
              B(k, e, 17)) : (B(g, e, 17),
              B(k, c, 17))
          }
          ,
          x: ()=>{
              L("")
          }
          ,
          i: ()=>{
              C || (Y("Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread"),
              L("Blocking on the main thread is not allowed by default. See https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread"))
          }
          ,
          G: ()=>Date.now(),
          l: ()=>{
              Q += 1;
              throw "unwind";
          }
          ,
          p: function(a, b, c) {
              var e = Error().stack.toString();
              e = e.slice(e.indexOf("\n", Math.max(e.lastIndexOf("_emscripten_log"), e.lastIndexOf("_emscripten_get_callstack"))) + 1);
              a & 8 && "undefined" == typeof emscripten_source_map && (Y('Source map information is not available, emscripten_log with EM_LOG_C_STACK will be ignored. Build with "--pre-js $EMSCRIPTEN/src/emscripten-source-map.min.js" linker flag to add source map loading to code.'),
              a = a ^ 8 | 16);
              var h = e.split("\n");
              e = "";
              var g = RegExp("\\s*(.*?)@(.*?):([0-9]+):([0-9]+)")
                , k = RegExp("\\s*(.*?)@(.*):(.*)(:(.*))?")
                , u = RegExp("\\s*at (.*?) \\((.*):(.*):(.*)\\)");
              for (m in h) {
                  var v = h[m], n;
                  if ((n = u.exec(v)) && 5 == n.length) {
                      v = n[1];
                      var x = n[2];
                      var N = n[3];
                      n = n[4]
                  } else if ((n = g.exec(v)) || (n = k.exec(v)),
                  n && 4 <= n.length)
                      v = n[1],
                      x = n[2],
                      N = n[3],
                      n = n[4] | 0;
                  else {
                      e += v + "\n";
                      continue
                  }
                  var O = !1;
                  if (a & 8) {
                      var d = emscripten_source_map.Ka({
                          line: N,
                          xa: n
                      });
                      if (O = d?.source)
                          a & 64 && (d.source = d.source.substring(d.source.replace(/\\/g, "/").lastIndexOf("/") + 1)),
                          e += `    at ${v} (${d.source}:${d.line}:${d.xa})\n`
                  }
                  if (a & 16 || !O)
                      a & 64 && (x = x.substring(x.replace(/\\/g, "/").lastIndexOf("/") + 1)),
                      e += (O ? `     = ${v}` : `    at ${v}`) + ` (${x}:${N}:${n})\n`
              }
              var m = e = e.replace(/\s+$/, "");
              return !b || 0 >= c ? A(m) + 1 : B(m, b, c) + 1
          },
          c: ()=>performance.timeOrigin + performance.now(),
          A: a=>{
              var b = q().length;
              a >>>= 0;
              if (a <= b || 2147483648 < a)
                  return !1;
              for (var c = 1; 4 >= c; c *= 2) {
                  var e = b * (1 + .2 / c);
                  e = Math.min(e, a + 100663296);
                  var h = Math;
                  e = Math.max(a, e);
                  a: {
                      h = (h.min.call(h, 2147483648, e + (65536 - e % 65536) % 65536) - f.buffer.byteLength + 65535) / 65536;
                      try {
                          f.grow(h);
                          p();
                          var g = 1;
                          break a
                      } catch (k) {}
                      g = void 0
                  }
                  if (g)
                      return !0
              }
              return !1
          }
          ,
          m: Ka,
          s: xb,
          t: yb,
          d: T,
          f: zb,
          u: Ab,
          n: Bb,
          z: Cb,
          q: (a,b)=>{
              Eb(q().subarray(a, a + b));
              return 0
          }
          ,
          y: function(a) {
              y.Ia(jb(a))
          },
          a: f || y.wasmMemory,
          r: (a,b,c,e)=>Jb(a, b, c, e)
      }
        , Z = function() {
          function a(c, e) {
              Z = c.exports;
              P.va.push(Z.P);
              ab = Z.R;
              ua.unshift(Z.H);
              ra = e;
              Aa();
              return Z
          }
          var b = {
              a: Mb
          };
          J++;
          if (y.instantiateWasm)
              try {
                  return y.instantiateWasm(b, a)
              } catch (c) {
                  F(`Module.instantiateWasm callback failed with error: ${c}`),
                  z(c)
              }
          Fa(b, function(c) {
              a(c.instance, c.module)
          }).catch(z);
          return {}
      }()
        , ka = y._free = a=>(ka = y._free = Z.I)(a)
        , ia = y._malloc = a=>(ia = y._malloc = Z.J)(a)
        , U = y._pthread_self = ()=>(U = y._pthread_self = Z.K)();
      y._main = (a,b)=>(y._main = Z.L)(a, b);
      var ja = y._uci = (a,b)=>(ja = y._uci = Z.M)(a, b)
        , la = y._set_weights = (a,b)=>(la = y._set_weights = Z.N)(a, b);
      y._quit = ()=>(y._quit = Z.O)();
      y.__emscripten_tls_init = ()=>(y.__emscripten_tls_init = Z.P)();
      var Nb = y.__emscripten_proxy_main = (a,b)=>(Nb = y.__emscripten_proxy_main = Z.Q)(a, b)
        , Sa = ()=>(Sa = Z.S)()
        , Lb = y.__emscripten_thread_init = (a,b,c,e,h,g)=>(Lb = y.__emscripten_thread_init = Z.T)(a, b, c, e, h, g);
      y.__emscripten_thread_crashed = ()=>(y.__emscripten_thread_crashed = Z.U)();
      var Ta = a=>(Ta = Z.V)(a)
        , Pa = (a,b,c,e,h)=>(Pa = Z.W)(a, b, c, e, h)
        , Za = a=>(Za = Z.X)(a)
        , bb = y.__emscripten_thread_exit = a=>(bb = y.__emscripten_thread_exit = Z.Y)(a)
        , ob = ()=>(ob = Z.Z)()
        , $a = (a,b)=>($a = Z._)(a, b)
        , Ma = a=>(Ma = Z.$)(a)
        , Oa = a=>(Oa = Z.aa)(a)
        , La = ()=>(La = Z.ba)();
      y.___original_main = ()=>(y.___original_main = Z.da)();
      y.___start_em_js = 84932;
      y.___stop_em_js = 84995;
      y.wasmMemory = f;
      y.keepRuntimeAlive = Ka;
      y.stringToUTF8 = B;
      y.lengthBytesUTF8 = A;
      y.ExitStatus = Ga;
      var Ob;
      K = function Pb() {
          Ob || Qb();
          Ob || (K = Pb)
      }
      ;
      function Qb() {
          if (!(0 < J))
              if (D)
                  ha(y),
                  D || S(ua),
                  startWorker(y);
              else if (S(ta),
              !(0 < J || Ob || (Ob = !0,
              y.calledRun = !0,
              H))) {
                  D || S(ua);
                  D || S(va);
                  ha(y);
                  if (Rb) {
                      var a = Nb;
                      Q += 1;
                      try {
                          var b = a(0, 0);
                          T(b, !0)
                      } catch (c) {
                          Wa(c)
                      }
                  }
                  D || S(xa)
              }
      }
      var Rb = !0;
      Qb();

      return readyPromise
  }
  );
}
)();
export default zerofish;