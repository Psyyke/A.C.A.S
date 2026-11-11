var t0=Object.create;var hl=Object.defineProperty;var e0=Object.getOwnPropertyDescriptor;var r0=Object.getOwnPropertyNames;var o0=Object.getPrototypeOf,n0=Object.prototype.hasOwnProperty;var ve=(r,t)=>()=>{try{return t||r((t={exports:{}}).exports,t),t.exports}catch(e){throw t=0,e}},Ht=(r,t)=>{for(var e in t)hl(r,e,{get:t[e],enumerable:!0})},s0=(r,t,e,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of r0(t))!n0.call(r,n)&&n!==e&&hl(r,n,{get:()=>t[n],enumerable:!(o=e0(t,n))||o.enumerable});return r};var rf=(r,t,e)=>(e=r!=null?t0(o0(r)):{},s0(t||!r||!r.__esModule?hl(e,"default",{value:r,enumerable:!0}):e,r));var Ff=ve((qF,Rf)=>{Rf.exports=vt;var ke=null;try{ke=new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0,1,13,2,96,0,1,127,96,4,127,127,127,127,1,127,3,7,6,0,1,1,1,1,1,6,6,1,127,1,65,0,11,7,50,6,3,109,117,108,0,1,5,100,105,118,95,115,0,2,5,100,105,118,95,117,0,3,5,114,101,109,95,115,0,4,5,114,101,109,95,117,0,5,8,103,101,116,95,104,105,103,104,0,0,10,191,1,6,4,0,35,0,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,126,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,127,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,128,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,129,34,4,66,32,135,167,36,0,32,4,167,11,36,1,1,126,32,0,173,32,1,173,66,32,134,132,32,2,173,32,3,173,66,32,134,132,130,34,4,66,32,135,167,36,0,32,4,167,11])),{}).exports}catch{}function vt(r,t,e){this.low=r|0,this.high=t|0,this.unsigned=!!e}vt.prototype.__isLong__;Object.defineProperty(vt.prototype,"__isLong__",{value:!0});function ie(r){return(r&&r.__isLong__)===!0}vt.isLong=ie;var vf={},kf={};function ro(r,t){var e,o,n;return t?(r>>>=0,(n=0<=r&&r<256)&&(o=kf[r],o)?o:(e=kt(r,(r|0)<0?-1:0,!0),n&&(kf[r]=e),e)):(r|=0,(n=-128<=r&&r<128)&&(o=vf[r],o)?o:(e=kt(r,r<0?-1:0,!1),n&&(vf[r]=e),e))}vt.fromInt=ro;function Ie(r,t){if(isNaN(r))return t?eo:Ee;if(t){if(r<0)return eo;if(r>=Nf)return Af}else{if(r<=-Ef)return se;if(r+1>=Ef)return Df}return r<0?Ie(-r,t).neg():kt(r%us|0,r/us|0,t)}vt.fromNumber=Ie;function kt(r,t,e){return new vt(r,t,e)}vt.fromBits=kt;var qa=Math.pow;function Rl(r,t,e){if(r.length===0)throw Error("empty string");if(r==="NaN"||r==="Infinity"||r==="+Infinity"||r==="-Infinity")return Ee;if(typeof t=="number"?(e=t,t=!1):t=!!t,e=e||10,e<2||36<e)throw RangeError("radix");var o;if((o=r.indexOf("-"))>0)throw Error("interior hyphen");if(o===0)return Rl(r.substring(1),t,e).neg();for(var n=Ie(qa(e,8)),s=Ee,i=0;i<r.length;i+=8){var a=Math.min(8,r.length-i),u=parseInt(r.substring(i,i+a),e);if(a<8){var p=Ie(qa(e,a));s=s.mul(p).add(Ie(u))}else s=s.mul(n),s=s.add(Ie(u))}return s.unsigned=t,s}vt.fromString=Rl;function Be(r,t){return typeof r=="number"?Ie(r,t):typeof r=="string"?Rl(r,t):kt(r.low,r.high,typeof t=="boolean"?t:r.unsigned)}vt.fromValue=Be;var If=65536,N0=1<<24,us=If*If,Nf=us*us,Ef=Nf/2,$f=ro(N0),Ee=ro(0);vt.ZERO=Ee;var eo=ro(0,!0);vt.UZERO=eo;var as=ro(1);vt.ONE=as;var Tf=ro(1,!0);vt.UONE=Tf;var Al=ro(-1);vt.NEG_ONE=Al;var Df=kt(-1,2147483647,!1);vt.MAX_VALUE=Df;var Af=kt(-1,-1,!0);vt.MAX_UNSIGNED_VALUE=Af;var se=kt(0,-2147483648,!1);vt.MIN_VALUE=se;var W=vt.prototype;W.toInt=function(){return this.unsigned?this.low>>>0:this.low};W.toNumber=function(){return this.unsigned?(this.high>>>0)*us+(this.low>>>0):this.high*us+(this.low>>>0)};W.toString=function(t){if(t=t||10,t<2||36<t)throw RangeError("radix");if(this.isZero())return"0";if(this.isNegative())if(this.eq(se)){var e=Ie(t),o=this.div(e),n=o.mul(e).sub(this);return o.toString(t)+n.toInt().toString(t)}else return"-"+this.neg().toString(t);for(var s=Ie(qa(t,6),this.unsigned),i=this,a="";;){var u=i.div(s),p=i.sub(u.mul(s)).toInt()>>>0,l=p.toString(t);if(i=u,i.isZero())return l+a;for(;l.length<6;)l="0"+l;a=""+l+a}};W.getHighBits=function(){return this.high};W.getHighBitsUnsigned=function(){return this.high>>>0};W.getLowBits=function(){return this.low};W.getLowBitsUnsigned=function(){return this.low>>>0};W.getNumBitsAbs=function(){if(this.isNegative())return this.eq(se)?64:this.neg().getNumBitsAbs();for(var t=this.high!=0?this.high:this.low,e=31;e>0&&(t&1<<e)==0;e--);return this.high!=0?e+33:e+1};W.isZero=function(){return this.high===0&&this.low===0};W.eqz=W.isZero;W.isNegative=function(){return!this.unsigned&&this.high<0};W.isPositive=function(){return this.unsigned||this.high>=0};W.isOdd=function(){return(this.low&1)===1};W.isEven=function(){return(this.low&1)===0};W.equals=function(t){return ie(t)||(t=Be(t)),this.unsigned!==t.unsigned&&this.high>>>31===1&&t.high>>>31===1?!1:this.high===t.high&&this.low===t.low};W.eq=W.equals;W.notEquals=function(t){return!this.eq(t)};W.neq=W.notEquals;W.ne=W.notEquals;W.lessThan=function(t){return this.comp(t)<0};W.lt=W.lessThan;W.lessThanOrEqual=function(t){return this.comp(t)<=0};W.lte=W.lessThanOrEqual;W.le=W.lessThanOrEqual;W.greaterThan=function(t){return this.comp(t)>0};W.gt=W.greaterThan;W.greaterThanOrEqual=function(t){return this.comp(t)>=0};W.gte=W.greaterThanOrEqual;W.ge=W.greaterThanOrEqual;W.compare=function(t){if(ie(t)||(t=Be(t)),this.eq(t))return 0;var e=this.isNegative(),o=t.isNegative();return e&&!o?-1:!e&&o?1:this.unsigned?t.high>>>0>this.high>>>0||t.high===this.high&&t.low>>>0>this.low>>>0?-1:1:this.sub(t).isNegative()?-1:1};W.comp=W.compare;W.negate=function(){return!this.unsigned&&this.eq(se)?se:this.not().add(as)};W.neg=W.negate;W.add=function(t){ie(t)||(t=Be(t));var e=this.high>>>16,o=this.high&65535,n=this.low>>>16,s=this.low&65535,i=t.high>>>16,a=t.high&65535,u=t.low>>>16,p=t.low&65535,l=0,c=0,m=0,f=0;return f+=s+p,m+=f>>>16,f&=65535,m+=n+u,c+=m>>>16,m&=65535,c+=o+a,l+=c>>>16,c&=65535,l+=e+i,l&=65535,kt(m<<16|f,l<<16|c,this.unsigned)};W.subtract=function(t){return ie(t)||(t=Be(t)),this.add(t.neg())};W.sub=W.subtract;W.multiply=function(t){if(this.isZero())return Ee;if(ie(t)||(t=Be(t)),ke){var e=ke.mul(this.low,this.high,t.low,t.high);return kt(e,ke.get_high(),this.unsigned)}if(t.isZero())return Ee;if(this.eq(se))return t.isOdd()?se:Ee;if(t.eq(se))return this.isOdd()?se:Ee;if(this.isNegative())return t.isNegative()?this.neg().mul(t.neg()):this.neg().mul(t).neg();if(t.isNegative())return this.mul(t.neg()).neg();if(this.lt($f)&&t.lt($f))return Ie(this.toNumber()*t.toNumber(),this.unsigned);var o=this.high>>>16,n=this.high&65535,s=this.low>>>16,i=this.low&65535,a=t.high>>>16,u=t.high&65535,p=t.low>>>16,l=t.low&65535,c=0,m=0,f=0,h=0;return h+=i*l,f+=h>>>16,h&=65535,f+=s*l,m+=f>>>16,f&=65535,f+=i*p,m+=f>>>16,f&=65535,m+=n*l,c+=m>>>16,m&=65535,m+=s*p,c+=m>>>16,m&=65535,m+=i*u,c+=m>>>16,m&=65535,c+=o*l+n*p+s*u+i*a,c&=65535,kt(f<<16|h,c<<16|m,this.unsigned)};W.mul=W.multiply;W.divide=function(t){if(ie(t)||(t=Be(t)),t.isZero())throw Error("division by zero");if(ke){if(!this.unsigned&&this.high===-2147483648&&t.low===-1&&t.high===-1)return this;var e=(this.unsigned?ke.div_u:ke.div_s)(this.low,this.high,t.low,t.high);return kt(e,ke.get_high(),this.unsigned)}if(this.isZero())return this.unsigned?eo:Ee;var o,n,s;if(this.unsigned){if(t.unsigned||(t=t.toUnsigned()),t.gt(this))return eo;if(t.gt(this.shru(1)))return Tf;s=eo}else{if(this.eq(se)){if(t.eq(as)||t.eq(Al))return se;if(t.eq(se))return as;var i=this.shr(1);return o=i.div(t).shl(1),o.eq(Ee)?t.isNegative()?as:Al:(n=this.sub(t.mul(o)),s=o.add(n.div(t)),s)}else if(t.eq(se))return this.unsigned?eo:Ee;if(this.isNegative())return t.isNegative()?this.neg().div(t.neg()):this.neg().div(t).neg();if(t.isNegative())return this.div(t.neg()).neg();s=Ee}for(n=this;n.gte(t);){o=Math.max(1,Math.floor(n.toNumber()/t.toNumber()));for(var a=Math.ceil(Math.log(o)/Math.LN2),u=a<=48?1:qa(2,a-48),p=Ie(o),l=p.mul(t);l.isNegative()||l.gt(n);)o-=u,p=Ie(o,this.unsigned),l=p.mul(t);p.isZero()&&(p=as),s=s.add(p),n=n.sub(l)}return s};W.div=W.divide;W.modulo=function(t){if(ie(t)||(t=Be(t)),ke){var e=(this.unsigned?ke.rem_u:ke.rem_s)(this.low,this.high,t.low,t.high);return kt(e,ke.get_high(),this.unsigned)}return this.sub(this.div(t).mul(t))};W.mod=W.modulo;W.rem=W.modulo;W.not=function(){return kt(~this.low,~this.high,this.unsigned)};W.and=function(t){return ie(t)||(t=Be(t)),kt(this.low&t.low,this.high&t.high,this.unsigned)};W.or=function(t){return ie(t)||(t=Be(t)),kt(this.low|t.low,this.high|t.high,this.unsigned)};W.xor=function(t){return ie(t)||(t=Be(t)),kt(this.low^t.low,this.high^t.high,this.unsigned)};W.shiftLeft=function(t){return ie(t)&&(t=t.toInt()),(t&=63)===0?this:t<32?kt(this.low<<t,this.high<<t|this.low>>>32-t,this.unsigned):kt(0,this.low<<t-32,this.unsigned)};W.shl=W.shiftLeft;W.shiftRight=function(t){return ie(t)&&(t=t.toInt()),(t&=63)===0?this:t<32?kt(this.low>>>t|this.high<<32-t,this.high>>t,this.unsigned):kt(this.high>>t-32,this.high>=0?0:-1,this.unsigned)};W.shr=W.shiftRight;W.shiftRightUnsigned=function(t){if(ie(t)&&(t=t.toInt()),t&=63,t===0)return this;var e=this.high;if(t<32){var o=this.low;return kt(o>>>t|e<<32-t,e>>>t,this.unsigned)}else return t===32?kt(e,0,this.unsigned):kt(e>>>t-32,0,this.unsigned)};W.shru=W.shiftRightUnsigned;W.shr_u=W.shiftRightUnsigned;W.toSigned=function(){return this.unsigned?kt(this.low,this.high,!1):this};W.toUnsigned=function(){return this.unsigned?this:kt(this.low,this.high,!0)};W.toBytes=function(t){return t?this.toBytesLE():this.toBytesBE()};W.toBytesLE=function(){var t=this.high,e=this.low;return[e&255,e>>>8&255,e>>>16&255,e>>>24,t&255,t>>>8&255,t>>>16&255,t>>>24]};W.toBytesBE=function(){var t=this.high,e=this.low;return[t>>>24,t>>>16&255,t>>>8&255,t&255,e>>>24,e>>>16&255,e>>>8&255,e&255]};vt.fromBytes=function(t,e,o){return o?vt.fromBytesLE(t,e):vt.fromBytesBE(t,e)};vt.fromBytesLE=function(t,e){return new vt(t[0]|t[1]<<8|t[2]<<16|t[3]<<24,t[4]|t[5]<<8|t[6]<<16|t[7]<<24,e)};vt.fromBytesBE=function(t,e){return new vt(t[4]<<24|t[5]<<16|t[6]<<8|t[7],t[0]<<24|t[1]<<16|t[2]<<8|t[3],e)}});var Ig=ve((kg,Kc)=>{(function(r,t,e){function o(a){var u=this,p=i();u.next=function(){var l=2091639*u.s0+u.c*23283064365386963e-26;return u.s0=u.s1,u.s1=u.s2,u.s2=l-(u.c=l|0)},u.c=1,u.s0=p(" "),u.s1=p(" "),u.s2=p(" "),u.s0-=p(a),u.s0<0&&(u.s0+=1),u.s1-=p(a),u.s1<0&&(u.s1+=1),u.s2-=p(a),u.s2<0&&(u.s2+=1),p=null}function n(a,u){return u.c=a.c,u.s0=a.s0,u.s1=a.s1,u.s2=a.s2,u}function s(a,u){var p=new o(a),l=u&&u.state,c=p.next;return c.int32=function(){return p.next()*4294967296|0},c.double=function(){return c()+(c()*2097152|0)*11102230246251565e-32},c.quick=c,l&&(typeof l=="object"&&n(l,p),c.state=function(){return n(p,{})}),c}function i(){var a=4022871197,u=function(p){p=String(p);for(var l=0;l<p.length;l++){a+=p.charCodeAt(l);var c=.02519603282416938*a;a=c>>>0,c-=a,c*=a,a=c>>>0,c-=a,a+=c*4294967296}return(a>>>0)*23283064365386963e-26};return u}t&&t.exports?t.exports=s:e&&e.amd?e(function(){return s}):this.alea=s})(kg,typeof Kc=="object"&&Kc,typeof define=="function"&&define)});var $g=ve((Eg,Xc)=>{(function(r,t,e){function o(i){var a=this,u="";a.x=0,a.y=0,a.z=0,a.w=0,a.next=function(){var l=a.x^a.x<<11;return a.x=a.y,a.y=a.z,a.z=a.w,a.w^=a.w>>>19^l^l>>>8},i===(i|0)?a.x=i:u+=i;for(var p=0;p<u.length+64;p++)a.x^=u.charCodeAt(p)|0,a.next()}function n(i,a){return a.x=i.x,a.y=i.y,a.z=i.z,a.w=i.w,a}function s(i,a){var u=new o(i),p=a&&a.state,l=function(){return(u.next()>>>0)/4294967296};return l.double=function(){do var c=u.next()>>>11,m=(u.next()>>>0)/4294967296,f=(c+m)/(1<<21);while(f===0);return f},l.int32=u.next,l.quick=l,p&&(typeof p=="object"&&n(p,u),l.state=function(){return n(u,{})}),l}t&&t.exports?t.exports=s:e&&e.amd?e(function(){return s}):this.xor128=s})(Eg,typeof Xc=="object"&&Xc,typeof define=="function"&&define)});var Tg=ve((Ng,jc)=>{(function(r,t,e){function o(i){var a=this,u="";a.next=function(){var l=a.x^a.x>>>2;return a.x=a.y,a.y=a.z,a.z=a.w,a.w=a.v,(a.d=a.d+362437|0)+(a.v=a.v^a.v<<4^(l^l<<1))|0},a.x=0,a.y=0,a.z=0,a.w=0,a.v=0,i===(i|0)?a.x=i:u+=i;for(var p=0;p<u.length+64;p++)a.x^=u.charCodeAt(p)|0,p==u.length&&(a.d=a.x<<10^a.x>>>4),a.next()}function n(i,a){return a.x=i.x,a.y=i.y,a.z=i.z,a.w=i.w,a.v=i.v,a.d=i.d,a}function s(i,a){var u=new o(i),p=a&&a.state,l=function(){return(u.next()>>>0)/4294967296};return l.double=function(){do var c=u.next()>>>11,m=(u.next()>>>0)/4294967296,f=(c+m)/(1<<21);while(f===0);return f},l.int32=u.next,l.quick=l,p&&(typeof p=="object"&&n(p,u),l.state=function(){return n(u,{})}),l}t&&t.exports?t.exports=s:e&&e.amd?e(function(){return s}):this.xorwow=s})(Ng,typeof jc=="object"&&jc,typeof define=="function"&&define)});var Ag=ve((Dg,Yc)=>{(function(r,t,e){function o(i){var a=this;a.next=function(){var p=a.x,l=a.i,c,m,f;return c=p[l],c^=c>>>7,m=c^c<<24,c=p[l+1&7],m^=c^c>>>10,c=p[l+3&7],m^=c^c>>>3,c=p[l+4&7],m^=c^c<<7,c=p[l+7&7],c=c^c<<13,m^=c^c<<9,p[l]=m,a.i=l+1&7,m};function u(p,l){var c,m,f=[];if(l===(l|0))m=f[0]=l;else for(l=""+l,c=0;c<l.length;++c)f[c&7]=f[c&7]<<15^l.charCodeAt(c)+f[c+1&7]<<13;for(;f.length<8;)f.push(0);for(c=0;c<8&&f[c]===0;++c);for(c==8?m=f[7]=-1:m=f[c],p.x=f,p.i=0,c=256;c>0;--c)p.next()}u(a,i)}function n(i,a){return a.x=i.x.slice(),a.i=i.i,a}function s(i,a){i==null&&(i=+new Date);var u=new o(i),p=a&&a.state,l=function(){return(u.next()>>>0)/4294967296};return l.double=function(){do var c=u.next()>>>11,m=(u.next()>>>0)/4294967296,f=(c+m)/(1<<21);while(f===0);return f},l.int32=u.next,l.quick=l,p&&(p.x&&n(p,u),l.state=function(){return n(u,{})}),l}t&&t.exports?t.exports=s:e&&e.amd?e(function(){return s}):this.xorshift7=s})(Dg,typeof Yc=="object"&&Yc,typeof define=="function"&&define)});var Fg=ve((Rg,Zc)=>{(function(r,t,e){function o(i){var a=this;a.next=function(){var p=a.w,l=a.X,c=a.i,m,f;return a.w=p=p+1640531527|0,f=l[c+34&127],m=l[c=c+1&127],f^=f<<13,m^=m<<17,f^=f>>>15,m^=m>>>12,f=l[c]=f^m,a.i=c,f+(p^p>>>16)|0};function u(p,l){var c,m,f,h,b,x=[],C=128;for(l===(l|0)?(m=l,l=null):(l=l+"\0",m=0,C=Math.max(C,l.length)),f=0,h=-32;h<C;++h)l&&(m^=l.charCodeAt((h+32)%l.length)),h===0&&(b=m),m^=m<<10,m^=m>>>15,m^=m<<4,m^=m>>>13,h>=0&&(b=b+1640531527|0,c=x[h&127]^=m+b,f=c==0?f+1:0);for(f>=128&&(x[(l&&l.length||0)&127]=-1),f=127,h=512;h>0;--h)m=x[f+34&127],c=x[f=f+1&127],m^=m<<13,c^=c<<17,m^=m>>>15,c^=c>>>12,x[f]=m^c;p.w=b,p.X=x,p.i=f}u(a,i)}function n(i,a){return a.i=i.i,a.w=i.w,a.X=i.X.slice(),a}function s(i,a){i==null&&(i=+new Date);var u=new o(i),p=a&&a.state,l=function(){return(u.next()>>>0)/4294967296};return l.double=function(){do var c=u.next()>>>11,m=(u.next()>>>0)/4294967296,f=(c+m)/(1<<21);while(f===0);return f},l.int32=u.next,l.quick=l,p&&(p.X&&n(p,u),l.state=function(){return n(u,{})}),l}t&&t.exports?t.exports=s:e&&e.amd?e(function(){return s}):this.xor4096=s})(Rg,typeof Zc=="object"&&Zc,typeof define=="function"&&define)});var Mg=ve((Pg,Qc)=>{(function(r,t,e){function o(i){var a=this,u="";a.next=function(){var l=a.b,c=a.c,m=a.d,f=a.a;return l=l<<25^l>>>7^c,c=c-m|0,m=m<<24^m>>>8^f,f=f-l|0,a.b=l=l<<20^l>>>12^c,a.c=c=c-m|0,a.d=m<<16^c>>>16^f,a.a=f-l|0},a.a=0,a.b=0,a.c=-1640531527,a.d=1367130551,i===Math.floor(i)?(a.a=i/4294967296|0,a.b=i|0):u+=i;for(var p=0;p<u.length+20;p++)a.b^=u.charCodeAt(p)|0,a.next()}function n(i,a){return a.a=i.a,a.b=i.b,a.c=i.c,a.d=i.d,a}function s(i,a){var u=new o(i),p=a&&a.state,l=function(){return(u.next()>>>0)/4294967296};return l.double=function(){do var c=u.next()>>>11,m=(u.next()>>>0)/4294967296,f=(c+m)/(1<<21);while(f===0);return f},l.int32=u.next,l.quick=l,p&&(typeof p=="object"&&n(p,u),l.state=function(){return n(u,{})}),l}t&&t.exports?t.exports=s:e&&e.amd?e(function(){return s}):this.tychei=s})(Pg,typeof Qc=="object"&&Qc,typeof define=="function"&&define)});var _g=ve(()=>{});var zg=ve((Bg,Cu)=>{(function(r,t,e){var o=256,n=6,s=52,i="random",a=e.pow(o,n),u=e.pow(2,s),p=u*2,l=o-1,c;function m(v,I,T){var R=[];I=I==!0?{entropy:!0}:I||{};var M=x(b(I.entropy?[v,k(t)]:v??C(),3),R),z=new f(R),B=function(){for(var H=z.g(n),Y=a,J=0;H<u;)H=(H+J)*o,Y*=o,J=z.g(1);for(;H>=p;)H/=2,Y/=2,J>>>=1;return(H+J)/Y};return B.int32=function(){return z.g(4)|0},B.quick=function(){return z.g(4)/4294967296},B.double=B,x(k(z.S),t),(I.pass||T||function(H,Y,J,it){return it&&(it.S&&h(it,z),H.state=function(){return h(z,{})}),J?(e[i]=H,Y):H})(B,M,"global"in I?I.global:this==e,I.state)}function f(v){var I,T=v.length,R=this,M=0,z=R.i=R.j=0,B=R.S=[];for(T||(v=[T++]);M<o;)B[M]=M++;for(M=0;M<o;M++)B[M]=B[z=l&z+v[M%T]+(I=B[M])],B[z]=I;(R.g=function(H){for(var Y,J=0,it=R.i,ut=R.j,pt=R.S;H--;)Y=pt[it=l&it+1],J=J*o+pt[l&(pt[it]=pt[ut=l&ut+Y])+(pt[ut]=Y)];return R.i=it,R.j=ut,J})(o)}function h(v,I){return I.i=v.i,I.j=v.j,I.S=v.S.slice(),I}function b(v,I){var T=[],R=typeof v,M;if(I&&R=="object")for(M in v)try{T.push(b(v[M],I-1))}catch{}return T.length?T:R=="string"?v:v+"\0"}function x(v,I){for(var T=v+"",R,M=0;M<T.length;)I[l&M]=l&(R^=I[l&M]*19)+T.charCodeAt(M++);return k(I)}function C(){try{var v;return c&&(v=c.randomBytes)?v=v(o):(v=new Uint8Array(o),(r.crypto||r.msCrypto).getRandomValues(v)),k(v)}catch{var I=r.navigator,T=I&&I.plugins;return[+new Date,r,T,r.screen,k(t)]}}function k(v){return String.fromCharCode.apply(0,v)}if(x(e.random(),t),typeof Cu=="object"&&Cu.exports){Cu.exports=m;try{c=_g()}catch{}}else typeof define=="function"&&define.amd?define(function(){return m}):e["seed"+i]=m})(typeof self<"u"?self:Bg,[],Math)});var Gg=ve((qQ,Lg)=>{var x3=Ig(),y3=$g(),b3=Tg(),w3=Ag(),S3=Fg(),C3=Mg(),ho=zg();ho.alea=x3;ho.xor128=y3;ho.xorwow=b3;ho.xorshift7=w3;ho.xor4096=S3;ho.tychei=C3;Lg.exports=ho});var dy=ve(()=>{});var hy=ve(()=>{});var _o="Abs",Bo="Acos",zo="Acosh",Ir="Add",Lo="AddN",gl="All",xl="Any",Go="ArgMax",Oo="ArgMin",Wo="Asin",Uo="Asinh",Vo="Atan",Ho="Atanh",qo="Atan2",Ko="AvgPool",Mi="AvgPoolGrad",Xo="AvgPool3D",_i="AvgPool3DGrad",jo="BatchMatMul",Yo="BatchToSpaceND",Bi="Bincount",zi="BitwiseAnd",of="BroadcastTo",Li="BroadcastArgs",ir="Cast",Er="Ceil",Zo="ClipByValue",Bs="Complex",Qo="ComplexAbs",Jo="Concat",tn="Conv2D",Gi="Conv2DBackpropFilter",en="Conv2DBackpropInput",rn="Conv3D",Oi="Conv3DBackpropFilterV2",Wi="Conv3DBackpropInputV2",Ui="Cos",on="Cosh",Vi="Cumprod",nn="Cumsum",Hi="CropAndResize",qi="DenseBincount",Ki="DepthToSpace",sn="DepthwiseConv2dNative",Xi="DepthwiseConv2dNativeBackpropFilter",ji="DepthwiseConv2dNativeBackpropInput",Yi="Diag",an="Dilation2D",Zi="Dilation2DBackpropInput",Qi="Dilation2DBackpropFilter",zs="Draw",un="RealDiv",Ji="Einsum",Ls="Elu",ta="EluGrad",ea="Erf",pn="Equal",ln="Exp",cn="ExpandDims",$r="Expm1",yl="FFT",ra="Fill",oa="FlipLeftRight",Nr="Floor",Tr="FloorDiv",mn="FusedBatchNorm",fn="GatherV2",na="GatherNd",dn="Greater",Dr="GreaterEqual",ar="Identity",sa="IFFT",ia="Imag",hn="IsFinite",gn="IsInf",xn="IsNan",yn="LeakyRelu",bn="Less",wn="LessEqual",aa="LinSpace",Sn="Log",Cn="Log1p",ua="LogicalAnd",pa="LogicalNot",la="LogicalOr",NF="LogicalXor",nf="LogSoftmax",TF="LowerBound",ca="LRN",ma="LRNGrad",DF="MatrixBandPart",fa="Max",Ar="Maximum",vn="MaxPool",da="MaxPoolGrad",kn="MaxPool3D",ha="MaxPool3DGrad",ga="MaxPoolWithArgmax",In="Mean",xa="Min",Rr="Minimum",En="MirrorPad",ya="Mod",ba="Multinomial",Fr="Multiply",Gs="Neg",$n="NotEqual",wa="NonMaxSuppressionV3",sf="NonMaxSuppressionV4",Sa="NonMaxSuppressionV5",Nn="OnesLike",Tn="OneHot",Dn="Pack",An="PadV2",AF="Pool",Ca="Pow",Rn="Prelu",jr="Prod",af="RaggedGather",uf="RaggedRange",pf="RaggedTensorToTensor",va="Range",Os="Real",Fn="Reciprocal",Pn="Relu",Mn="Reshape",_n="ResizeNearestNeighbor",ka="ResizeNearestNeighborGrad",Bn="ResizeBilinear",Ia="ResizeBilinearGrad",zn="Relu6",Ln="Reverse",Gn="Round",Pr="Rsqrt",Ea="ScatterNd",$a="TensorScatterUpdate",Na="SearchSorted",On="Select",Wn="Selu",Yr="Slice",Ta="Sin",Un="Sinh",Vn="Sign",Mr="Sigmoid",Hn="Softplus",_r="Sqrt",Da="Sum",qn="SpaceToBatchND",Kn="SplitV",Xn="Softmax",lf="SparseFillEmptyRows",cf="SparseReshape",Aa="SparseSegmentMean",Ra="SparseSegmentSum",Fa="SparseToDense",Br="SquaredDifference",Pa="Square",Ma="StaticRegexReplace",_a="StridedSlice",Ba="StringNGrams",mf="StringSplit",ff="StringToHashBucketFast",jn="Sub",za="Tan",Yn="Tanh",zr="Tile",La="TopK",Ga="Transform",Lr="Transpose",df="Unique",Zn="Unpack",Qn="UnsortedSegmentSum",RF="UpperBound",Jn="ZerosLike",ts="Step",Ws="FromPixels",Oa="RotateWithOffset",Us="_FusedMatMul",Vs="FusedConv2D",Hs="FusedDepthwiseConv2D";var qs=class{constructor(t,e){this.backend=t,this.dataMover=e,this.data=new WeakMap,this.dataIdsCount=0}get(t){return this.data.has(t)||this.dataMover.moveData(this.backend,t),this.data.get(t)}set(t,e){this.dataIdsCount++,this.data.set(t,e)}has(t){return this.data.has(t)}delete(t){return this.dataIdsCount--,this.data.delete(t)}numDataIds(){return this.dataIdsCount}},Zr=class{refCount(t){return ne("refCount")}incRef(t){return ne("incRef")}timerAvailable(){return!0}time(t){return ne("time")}read(t){return ne("read")}readSync(t){return ne("readSync")}readToGPU(t,e){return ne("readToGPU")}numDataIds(){return ne("numDataIds")}disposeData(t,e){return ne("disposeData")}write(t,e,o){return ne("write")}move(t,e,o,n,s){return ne("move")}createTensorFromGPUData(t,e,o){return ne("createTensorFromGPUData")}memory(){return ne("memory")}floatPrecision(){return ne("floatPrecision")}epsilon(){return this.floatPrecision()===32?1e-7:1e-4}dispose(){return ne("dispose")}};function ne(r){throw new Error(`'${r}' not yet implemented or not found in the registry. This kernel may not be supported by the tfjs backend you have chosen`)}function hf(r){let t=r.length,e=0;for(;t>0;)e=Math.random()*t|0,t--,Wa(r,t,e)}function i0(r,t){if(r.length!==t.length)throw new Error(`Array sizes must match to be shuffled together First array length was ${r.length}Second array length was ${t.length}`);let e=r.length,o=0;for(;e>0;)o=Math.random()*e|0,e--,Wa(r,e,o),Wa(t,e,o)}function es(r,t,e){return Math.max(r,Math.min(t,e))}function a0(r){return r%2===0?r:r+1}function Wa(r,t,e){let o=r[t];r[t]=r[e],r[e]=o}function u0(r){let t=0;for(let e=0;e<r.length;e++)t+=r[e];return t}function p0(r,t){let e=Math.random();return t*e+(1-e)*r}function l0(r,t){let e=0;for(let o=0;o<r.length;o++){let n=Number(r[o])-Number(t[o]);e+=n*n}return e}function w(r,t){if(!r)throw new Error(typeof t=="string"?t:t())}function yt(r,t,e=""){w(Xt(r,t),()=>e+` Shapes ${r} and ${t} must match`)}function de(r){w(r!=null,()=>"The input to the tensor constructor must be a non-null value.")}function rt(r){if(r.length===0)return 1;let t=r[0];for(let e=1;e<r.length;e++)t*=r[e];return t}function c0(r){return r.length===0}function bl(r,t){if(r===t)return!0;if(r==null||t==null||r.length!==t.length)return!1;for(let e=0;e<r.length;e++)if(r[e]!==null&&t[e]!==null&&r[e]!==t[e])return!1;return!0}function Xt(r,t){if(r===t)return!0;if(r==null||t==null||r.length!==t.length)return!1;for(let e=0;e<r.length;e++)if(r[e]!==t[e])return!1;return!0}function ur(r){return r%1===0}function m0(r){if(Math.tanh!=null)return Math.tanh(r);if(r===1/0)return 1;if(r===-1/0)return-1;{let t=Math.exp(2*r);return(t-1)/(t+1)}}function f0(r){let t=Math.ceil(Math.sqrt(r));return[t,Math.ceil(r/t)]}function d0(r){let t=new Uint32Array(r);for(let e=0;e<r;++e)t[e]=e;return hf(t),t}function Jr(r,t){return t<=r.length?r:r+" ".repeat(t-r.length)}function h0(r,t=n=>0,e,o){return new Promise((n,s)=>{let i=0,a=()=>{if(r()){n();return}i++;let u=t(i);if(e!=null&&i>=e){s();return}o!=null?o(a,u):setTimeout(a,u)};a()})}function g0(r,t){let e=1,o=-1;for(let s=0;s<r.length;++s)if(r[s]>=0)e*=r[s];else if(r[s]===-1){if(o!==-1)throw Error(`Shapes can only have 1 implicit size. Found -1 at dim ${o} and dim ${s}`);o=s}else if(r[s]<0)throw Error(`Shapes can not be < 0. Found ${r[s]} at dim ${s}`);if(o===-1){if(t>0&&t!==e)throw Error(`Size(${t}) must match the product of shape ${r}`);return r}if(e===0)throw Error(`Cannot infer the missing size in [${r}] when there are 0 elements`);if(t%e!==0)throw Error(`The implicit shape can't be a fractional number. Got ${t} / ${e}`);let n=r.slice();return n[o]=t/e,n}function Rt(r,t){let e=t.length;return r=r==null?t.map((o,n)=>n):[].concat(r),w(r.every(o=>o>=-e&&o<e),()=>`All values in axis param must be in range [-${e}, ${e}) but got axis ${r}`),w(r.every(o=>ur(o)),()=>`All values in axis param must be integers but got axis ${r}`),r.map(o=>o<0?e+o:o)}function wl(r,t){let e=[],o=[],n=t!=null&&Array.isArray(t)&&t.length===0,s=t==null||n?null:Rt(t,r).sort(),i=0;for(let a=0;a<r.length;++a){if(s!=null){if(s[i]===a&&r[a]!==1)throw new Error(`Can't squeeze axis ${a} since its dim '${r[a]}' is not 1`);(s[i]==null||s[i]>a)&&r[a]===1&&(e.push(r[a]),o.push(a)),s[i]<=a&&i++}r[a]!==1&&(e.push(r[a]),o.push(a))}return{newShape:e,keptDims:o}}function Sl(r,t){return Ua(r,t)}function Ua(r,t){let e=null;if(r==null||r==="float32")e=new Float32Array(t);else if(r==="int32")e=new Int32Array(t);else if(r==="bool")e=new Uint8Array(t);else if(r==="string")e=new Array(t);else throw new Error(`Unknown data type ${r}`);return e}function Cl(r,t){for(let e=0;e<r.length;e++){let o=r[e];if(isNaN(o)||!isFinite(o))throw Error(`A tensor of type ${t} being uploaded contains ${o}.`)}}function vl(r){return r==="bool"||r==="complex64"||r==="float32"||r==="int32"||r==="string"}function x0(r,t){return!(t==="complex64"||t==="float32"&&r!=="complex64"||t==="int32"&&r!=="float32"&&r!=="complex64"||t==="bool"&&r==="bool")}function rs(r){if(r==="float32"||r==="int32")return 4;if(r==="complex64")return 8;if(r==="bool")return 1;throw new Error(`Unknown dtype ${r}`)}function kl(r){if(r==null)return 0;let t=0;return r.forEach(e=>t+=e.length),t}function _e(r){return typeof r=="string"||r instanceof String}function gf(r){return typeof r=="boolean"}function xf(r){return typeof r=="number"}function Gr(r){return Array.isArray(r)?Gr(r[0]):r instanceof Float32Array?"float32":r instanceof Int32Array||r instanceof Uint8Array||r instanceof Uint8ClampedArray?"int32":xf(r)?"float32":_e(r)?"string":gf(r)?"bool":"float32"}function Ke(r){return!!(r&&r.constructor&&r.call&&r.apply)}function os(r,t){for(let e=t;e<r;++e)if(r%e===0)return e;return r}function Xe(r){let t=r.length;if(t<2)return[];let e=new Array(t-1);e[t-2]=r[t-1];for(let o=t-3;o>=0;--o)e[o]=e[o+1]*r[o+1];return e}function yf(r,t,e,o=!1){let n=new Array;if(t.length===1){let s=t[0]*(o?2:1);for(let i=0;i<s;i++)n[i]=e[r+i]}else{let s=t[0],i=t.slice(1),a=i.reduce((u,p)=>u*p)*(o?2:1);for(let u=0;u<s;u++)n[u]=yf(r+u*a,i,e,o)}return n}function Qr(r,t,e=!1){if(r.length===0)return t[0];let o=r.reduce((n,s)=>n*s)*(e?2:1);if(o===0)return[];if(o!==t.length)throw new Error(`[${r}] does not match the input size ${t.length}${e?" for a complex tensor":""}.`);return yf(0,r,t,e)}function y0(r,t){if(Array.isArray(r))return r;if(t==="float32")return r instanceof Float32Array?r:new Float32Array(r);if(t==="int32")return r instanceof Int32Array?r:new Int32Array(r);if(t==="bool"||t==="string")return Uint8Array.from(new Int32Array(r));throw new Error(`Unknown dtype ${t}`)}function Ks(r,t){let e=ns(r,t);for(let o=0;o<e.length;o++)e[o]=1;return e}function ns(r,t){if(t==null||t==="float32"||t==="complex64")return new Float32Array(r);if(t==="int32")return new Int32Array(r);if(t==="bool")return new Uint8Array(r);throw new Error(`Unknown data type ${t}`)}function b0(r,t){let e=r.reduce((o,n)=>o*n,1);if(t==null||t==="float32")return Qr(r,new Float32Array(e));if(t==="int32")return Qr(r,new Int32Array(e));if(t==="bool")return Qr(r,new Uint8Array(e));throw new Error(`Unknown data type ${t}`)}function wt(r){r.forEach(t=>{w(Number.isInteger(t)&&t>=0,()=>`Tensor must have a shape comprised of positive integers but got shape [${r}].`)})}function w0(r,t,e){if(t===0)return 0;if(t===1)return r[0];let o=r[r.length-1];for(let n=0;n<r.length-1;++n)o+=e[n]*r[n];return o}function S0(r,t,e){if(t===0)return[];if(t===1)return[r];let o=new Array(t);for(let n=0;n<o.length-1;++n)o[n]=Math.floor(r/e[n]),r-=o[n]*e[n];return o[o.length-1]=r,o}function to(r){return r&&r.then&&typeof r.then=="function"}var bf="tfjsflags",Xs=class{constructor(t){this.global=t,this.flags={},this.flagRegistry={},this.urlFlags={},this.getQueryParams=v0,this.populateURLFlags()}setPlatform(t,e){this.platform!=null&&(L().getBool("IS_TEST")||L().getBool("PROD")||console.warn(`Platform ${this.platformName} has already been set. Overwriting the platform with ${t}.`)),this.platformName=t,this.platform=e}registerFlag(t,e,o){if(this.flagRegistry[t]={evaluationFn:e,setHook:o},this.urlFlags[t]!=null){let n=this.urlFlags[t];L().getBool("IS_TEST")||L().getBool("PROD")||console.warn(`Setting feature override from URL ${t}: ${n}.`),this.set(t,n)}}async getAsync(t){return t in this.flags?this.flags[t]:(this.flags[t]=await this.evaluateFlag(t),this.flags[t])}get(t){if(t in this.flags)return this.flags[t];let e=this.evaluateFlag(t);if(to(e))throw new Error(`Flag ${t} cannot be synchronously evaluated. Please use getAsync() instead.`);return this.flags[t]=e,this.flags[t]}getNumber(t){return this.get(t)}getBool(t){return this.get(t)}getString(t){return this.get(t)}getFlags(){return this.flags}get features(){return this.flags}set(t,e){if(this.flagRegistry[t]==null)throw new Error(`Cannot set flag ${t} as it has not been registered.`);this.flags[t]=e,this.flagRegistry[t].setHook!=null&&this.flagRegistry[t].setHook(e)}evaluateFlag(t){if(this.flagRegistry[t]==null)throw new Error(`Cannot evaluate flag '${t}': no evaluation function found.`);return this.flagRegistry[t].evaluationFn()}setFlags(t){this.flags=Object.assign({},t)}reset(){this.flags={},this.urlFlags={},this.populateURLFlags()}populateURLFlags(){if(typeof this.global>"u"||typeof this.global.location>"u"||typeof this.global.location.search>"u")return;let t=this.getQueryParams(this.global.location.search);bf in t&&t[bf].split(",").forEach(o=>{let[n,s]=o.split(":");this.urlFlags[n]=I0(n,s)})}};function v0(r){let t={};return r.replace(/[?&]([^=?&]+)(?:=([^&]*))?/g,(e,...o)=>(k0(t,o[0],o[1]),o.join("="))),t}function k0(r,t,e){r[decodeURIComponent(t)]=decodeURIComponent(e||"")}function I0(r,t){let e=t.toLowerCase();return e==="true"||e==="false"?e==="true":`${+e}`===e?+e:t}function L(){return Il}var Il=null;function wf(r){Il=r}var El;function $l(){if(El==null){let r;if(typeof window<"u")r=window;else if(typeof global<"u")r=global;else if(typeof process<"u")r=process;else if(typeof self<"u")r=self;else throw new Error("Could not find a global object");El=r}return El}function E0(){let r=$l();return r._tfGlobals==null&&(r._tfGlobals=new Map),r._tfGlobals}function js(r,t){let e=E0();if(e.has(r))return e.get(r);{let o=t();return e.set(r,o),e.get(r)}}function je(...r){L().getBool("IS_TEST")||L().getBool("PROD")||console.warn(...r)}function $0(...r){L().getBool("IS_TEST")||L().getBool("PROD")||console.log(...r)}var ss=js("kernelRegistry",()=>new Map),Ys=js("gradRegistry",()=>new Map);function is(r,t){let e=Dl(r,t);return ss.get(e)}function Nl(r){return Ys.get(r)}function Va(r){let t=ss.entries(),e=[];for(;;){let{done:o,value:n}=t.next();if(o)break;let[s,i]=n,[a]=s.split("_");a===r&&e.push(i)}return e}function Tl(r){let{kernelName:t,backendName:e}=r,o=Dl(t,e);ss.has(o)&&je(`The kernel '${t}' for backend '${e}' is already registered`),ss.set(o,r)}function Cf(r){let{kernelName:t}=r;Ys.has(t)&&L().getBool("DEBUG")&&je(`Overriding the gradient for '${t}'`),Ys.set(t,r)}function OF(r,t){let e=Dl(r,t);if(!ss.has(e))throw new Error(`The kernel '${r}' for backend '${t}' is not registered`);ss.delete(e)}function WF(r){if(!Ys.has(r))throw new Error(`The gradient '${r}' for backend is not registered`);Ys.delete(r)}function UF(r,t){Va(r).forEach(o=>{let n=Object.assign({},o,{backendName:t});Tl(n)})}function Dl(r,t){return`${t}_${r}`}var S={};Ht(S,{arraysEqual:()=>Xt,arraysEqualWithNull:()=>bl,assert:()=>w,assertNonNegativeIntegerDimensions:()=>wt,assertNonNull:()=>de,assertShapesMatch:()=>yt,bytesFromStringArray:()=>kl,bytesPerElement:()=>rs,checkConversionForErrors:()=>Cl,clamp:()=>es,computeStrides:()=>Xe,convertBackendValuesAndArrayBuffer:()=>y0,createScalarValue:()=>P0,createShuffledIndices:()=>d0,decodeString:()=>ls,distSquared:()=>l0,encodeString:()=>Wr,fetch:()=>_0,fingerPrint64:()=>F0,flatten:()=>ze,getArrayFromDType:()=>Ua,getTypedArrayFromDType:()=>Sl,hasEncodingLoss:()=>x0,hexToLong:()=>Zs,indexToLoc:()=>S0,inferDtype:()=>Gr,inferFromImplicitShape:()=>g0,isBoolean:()=>gf,isFunction:()=>Ke,isInt:()=>ur,isNumber:()=>xf,isPromise:()=>to,isScalarShape:()=>c0,isString:()=>_e,isTypedArray:()=>Dt,isValidDtype:()=>vl,locToIndex:()=>w0,makeOnesTypedArray:()=>Ks,makeZerosNestedTypedArray:()=>b0,makeZerosTypedArray:()=>ns,nearestDivisor:()=>os,nearestLargerEven:()=>a0,now:()=>so,parseAxisParam:()=>Rt,randUniform:()=>p0,repeatedTry:()=>h0,rightPad:()=>Jr,shuffle:()=>hf,shuffleCombo:()=>i0,sizeFromShape:()=>rt,sizeToSquarishShape:()=>f0,squeezeShape:()=>wl,sum:()=>u0,swap:()=>Wa,tanh:()=>m0,toNestedArray:()=>Qr,toTypedArray:()=>ps});function Ha(r){return r instanceof Float32Array||r instanceof Int32Array||r instanceof Uint8Array||r instanceof Uint8ClampedArray}var Pl=rf(Ff());var no=Pl.default||Pl;function Zs(r){return no.fromString(r,!0,16)}var Mf=Zs("c3a5c85c97cb3127"),oo=Zs("b492b66fbe98f273"),jt=Zs("9ae16a3b2f90404f");function Fl(r){return r.xor(r.shru(47))}function _f(r,t,e){let o=r.slice(t,t+e);return no.fromBytes(Array.from(o),!0,!0)}function St(r,t){return _f(r,t,8)}function Pf(r,t){return _f(r,t,4)}function _t(r,t){return t===0?r:r.shru(t).or(r.shl(64-t))}function Or(r,t,e=Zs("9ddfea08eb382d69")){let o=r.xor(t).mul(e);o=o.xor(o.shru(47));let n=t.xor(o).mul(e);return n=n.xor(n.shru(47)),n=n.mul(e),n}function T0(r,t,e,o,n,s){n=n.add(r),s=_t(s.add(n).add(o),21);let i=n;return n=n.add(t),n=n.add(e),s=s.add(_t(n,44)),[n.add(o),s.add(i)]}function Ka(r,t,e,o){return T0(St(r,t),St(r,t+8),St(r,t+16),St(r,t+24),e,o)}function D0(r,t=r.length){if(t>=8){let e=jt.add(t*2),o=St(r,0).add(jt),n=St(r,t-8),s=_t(n,37).mul(e).add(o),i=_t(o,25).add(n).mul(e);return Or(s,i,e)}if(t>=4){let e=jt.add(t*2),o=Pf(r,0);return Or(o.shl(3).add(t),Pf(r,t-4),e)}if(t>0){let e=r[0],o=r[t>>1],n=r[t-1],s=e+(o<<8),i=t+(n<<2);return Fl(jt.mul(s).xor(Mf.mul(i))).mul(jt)}return jt}function A0(r,t=r.length){let e=jt.add(t*2),o=St(r,0).mul(oo),n=St(r,8),s=St(r,t-8).mul(e),i=St(r,t-16).mul(jt);return Or(_t(o.add(n),43).add(_t(s,30)).add(i),o.add(_t(n.add(jt),18)).add(s),e)}function R0(r,t=r.length){let e=jt.add(t*2),o=St(r,0).mul(jt),n=St(r,8),s=St(r,t-8).mul(e),i=St(r,t-16).mul(jt),a=_t(o.add(n),43).add(_t(s,30)).add(i),u=Or(a,o.add(_t(n.add(jt),18)).add(s),e),p=St(r,16).mul(e),l=St(r,24),c=a.add(St(r,t-32)).mul(e),m=u.add(St(r,t-24)).mul(e);return Or(_t(p.add(l),43).add(_t(c,30)).add(m),p.add(_t(l.add(o),18)).add(c),e)}function F0(r,t=r.length){let e=no.fromNumber(81,!0);if(t<=32)return t<=16?D0(r,t):A0(r,t);if(t<=64)return R0(r,t);let o=e,n=e.mul(oo).add(113),s=Fl(n.mul(jt).add(113)).mul(jt),i=[no.UZERO,no.UZERO],a=[no.UZERO,no.UZERO];o=o.mul(jt).add(St(r,0));let u=0,p=(t-1>>6)*64,l=p+(t-1&63)-63;do o=_t(o.add(n).add(i[0]).add(St(r,u+8)),37).mul(oo),n=_t(n.add(i[1]).add(St(r,u+48)),42).mul(oo),o=o.xor(a[1]),n=n.add(i[0]).add(St(r,u+40)),s=_t(s.add(a[0]),33).mul(oo),i=Ka(r,u,i[1].mul(oo),o.add(a[0])),a=Ka(r,u+32,s.add(a[1]),n.add(St(r,u+16))),[s,o]=[o,s],u+=64;while(u!==p);let c=oo.add(s.and(255).shl(1));return u=l,a[0]=a[0].add(t-1&63),i[0]=i[0].add(a[0]),a[0]=a[0].add(i[0]),o=_t(o.add(n).add(i[0]).add(St(r,u+8)),37).mul(c),n=_t(n.add(i[1]).add(St(r,u+48)),42).mul(c),o=o.xor(a[1].mul(9)),n=n.add(i[0].mul(9).add(St(r,u+40))),s=_t(s.add(a[0]),33).mul(c),i=Ka(r,u,i[1].mul(c),o.add(a[0])),a=Ka(r,u+32,s.add(a[1]),n.add(St(r,u+16))),[s,o]=[o,s],Or(Or(i[0],a[0],c).add(Fl(n).mul(Mf)).add(s),Or(i[1],a[1],c).add(o),c)}function P0(r,t){return t==="string"?Wr(r):ps([r],t)}function M0(r,t){return r instanceof Float32Array&&t==="float32"||r instanceof Int32Array&&t==="int32"||r instanceof Uint8Array&&t==="bool"}function ps(r,t){if(t==="string")throw new Error("Cannot convert a string[] to a TypedArray");if(Array.isArray(r)&&(r=ze(r)),L().getBool("DEBUG")&&Cl(r,t),M0(r,t))return r;if(t==null||t==="float32"||t==="complex64")return new Float32Array(r);if(t==="int32")return new Int32Array(r);if(t==="bool"){let e=new Uint8Array(r.length);for(let o=0;o<e.length;++o)Math.round(r[o])!==0&&(e[o]=1);return e}else throw new Error(`Unknown data type ${t}`)}function so(){return L().platform.now()}function _0(r,t){return L().platform.fetch(r,t)}function Wr(r,t="utf-8"){return t=t||"utf-8",L().platform.encode(r,t)}function ls(r,t="utf-8"){return t=t||"utf-8",L().platform.decode(r,t)}function Dt(r){return L().platform.isTypedArray!=null?L().platform.isTypedArray(r):Ha(r)}function ze(r,t=[],e=!1){if(t==null&&(t=[]),typeof r=="boolean"||typeof r=="number"||typeof r=="string"||to(r)||r==null||Dt(r)&&e)t.push(r);else if(Array.isArray(r)||Dt(r))for(let o=0;o<r.length;++o)ze(r[o],t,e);else{let o=-1;for(let n of Object.keys(r))/^([1-9]+[0-9]*|0)$/.test(n)&&(o=Math.max(o,Number(n)));for(let n=0;n<=o;n++)ze(r[n],t,e)}return t}var Xa=class{constructor(t,e){this.backendTimer=t,this.logger=e,e==null&&(this.logger=new Ml)}profileKernel(t,e,o){let n,s=()=>{n=o()},i,a=so();if(this.backendTimer.timerAvailable())i=this.backendTimer.time(s);else{s();for(let p of n)p.dataSync();i=Promise.resolve({kernelMs:so()-a})}if(L().getBool("CHECK_COMPUTATION_FOR_ERRORS"))for(let p=0;p<n.length;p++){let l=n[p];l.data().then(c=>{B0(c,l.dtype,t)})}return{kernelName:t,outputs:n,inputs:e,timeMs:i.then(p=>p.kernelMs),extraInfo:i.then(p=>p.getExtraProfileInfo!=null?p.getExtraProfileInfo():"")}}logKernelProfile(t){let{kernelName:e,outputs:o,timeMs:n,inputs:s,extraInfo:i}=t;o.forEach(a=>{Promise.all([a.data(),n,i]).then(u=>{this.logger.logKernelProfile(e,a,u[0],u[1],s,u[2])})})}};function B0(r,t,e){if(t!=="float32")return!1;for(let o=0;o<r.length;o++){let n=r[o];if(isNaN(n)||!isFinite(n))return console.warn(`Found ${n} in the result of '${e}'`),!0}return!1}var Ml=class{logKernelProfile(t,e,o,n,s,i){let a=typeof n=="number"?Jr(`${n}ms`,9):n.error,u=Jr(t,25),p=e.rank,l=e.size,c=Jr(e.shape.toString(),14),m="";for(let f in s){let h=s[f];if(h!=null){let b=h.shape||e.shape,x=b.length;m+=`${f}: ${x}D ${x>0?b:""} `}}console.log(`%c${u}	%c${a}	%c${p}D ${c}	%c${l}	%c${m}	%c${i}`,"font-weight:bold","color:red","color:blue","color: orange","color: green","color: steelblue")}};function Bf(r,t,e){let o={},n={};for(let u=0;u<t.length;u++)o[t[u].id]=!0;for(let u=0;u<r.length;u++){let p=r[u],l=p.inputs;for(let c in l){let m=l[c],f=!1;for(let h=0;h<t.length;h++)if(o[m.id]){p.outputs.forEach(b=>o[b.id]=!0),f=!0,n[p.id]=!0;break}if(f)break}}let s={};s[e.id]=!0;let i={};for(let u=r.length-1;u>=0;u--){let p=r[u],l=p.inputs;for(let c=0;c<p.outputs.length;c++)if(s[p.outputs[c].id]){for(let m in l)s[l[m].id]=!0,i[p.id]=!0;break}}let a=[];for(let u=0;u<r.length;u++){let p=r[u];if(n[p.id]&&i[p.id]){let l={};for(let m in p.inputs){let f=p.inputs[m];o[f.id]&&(l[m]=f)}let c=Object.assign({},p);c.inputs=l,c.outputs=p.outputs,a.push(c)}}return a}function zf(r,t,e,o){for(let n=t.length-1;n>=0;n--){let s=t[n],i=[];if(s.outputs.forEach(u=>{let p=r[u.id];p!=null?i.push(p):i.push(null)}),s.gradient==null)throw new Error(`Cannot compute gradient: gradient function not found for ${s.kernelName}.`);let a=s.gradient(i);for(let u in s.inputs){if(!(u in a))throw new Error(`Cannot backprop through input ${u}. Available gradients found: ${Object.keys(a)}.`);let p=e(()=>a[u]());if(p.dtype!=="float32")throw new Error(`Error in gradient for op ${s.kernelName}. The gradient of input ${u} must have 'float32' dtype, but has '${p.dtype}'`);let l=s.inputs[u];if(!Xt(p.shape,l.shape))throw new Error(`Error in gradient for op ${s.kernelName}. The gradient of input '${u}' has shape '${p.shape}', which does not match the shape of the input '${l.shape}'`);if(r[l.id]==null)r[l.id]=p;else{let c=r[l.id];r[l.id]=o(c,p),c.dispose()}}}}var Lf=20,Qs=3,_l=7;function Gf(r,t,e,o){let n=Xe(t),s=z0(r,t,e,n),i=t.length,a=ja(r,t,e,n,s),u=["Tensor"];return o&&(u.push(`  dtype: ${e}`),u.push(`  rank: ${i}`),u.push(`  shape: [${t}]`),u.push("  values:")),u.push(a.map(p=>"    "+p).join(`
`)),u.join(`
`)}function z0(r,t,e,o){let n=rt(t),s=o[o.length-1],i=new Array(s).fill(0),a=t.length,u=e==="complex64"?ti(r):r;if(a>1)for(let p=0;p<n/s;p++){let l=p*s;for(let c=0;c<s;c++)i[c]=Math.max(i[c],Js(u[l+c],0,e).length)}return i}function Js(r,t,e){let o;return Array.isArray(r)?o=`${parseFloat(r[0].toFixed(_l))} + ${parseFloat(r[1].toFixed(_l))}j`:_e(r)?o=`'${r}'`:e==="bool"?o=Of(r):o=parseFloat(r.toFixed(_l)).toString(),Jr(o,t)}function Of(r){return r===0?"false":"true"}function ja(r,t,e,o,n,s=!0){let i=e==="complex64"?2:1,a=t[0],u=t.length;if(u===0){if(e==="complex64"){let b=ti(r);return[Js(b[0],0,e)]}return e==="bool"?[Of(r[0])]:[r[0].toString()]}if(u===1){if(a>Lf){let x=Qs*i,C=Array.from(r.slice(0,x)),k=Array.from(r.slice((a-Qs)*i,a*i));return e==="complex64"&&(C=ti(C),k=ti(k)),["["+C.map((v,I)=>Js(v,n[I],e)).join(", ")+", ..., "+k.map((v,I)=>Js(v,n[a-Qs+I],e)).join(", ")+"]"]}return["["+(e==="complex64"?ti(r):Array.from(r)).map((x,C)=>Js(x,n[C],e)).join(", ")+"]"]}let p=t.slice(1),l=o.slice(1),c=o[0]*i,m=[];if(a>Lf){for(let b=0;b<Qs;b++){let x=b*c,C=x+c;m.push(...ja(r.slice(x,C),p,e,l,n,!1))}m.push("...");for(let b=a-Qs;b<a;b++){let x=b*c,C=x+c;m.push(...ja(r.slice(x,C),p,e,l,n,b===a-1))}}else for(let b=0;b<a;b++){let x=b*c,C=x+c;m.push(...ja(r.slice(x,C),p,e,l,n,b===a-1))}let f=u===2?",":"";m[0]="["+(a>0?m[0]+f:"");for(let b=1;b<m.length-1;b++)m[b]=" "+m[b]+f;let h=`,
`;for(let b=2;b<u;b++)h+=`
`;return m[m.length-1]=" "+m[m.length-1]+"]"+(s?"":h),m}function ti(r){let t=[];for(let e=0;e<r.length;e+=2)t.push([r[e],r[e+1]]);return t}var he=class{constructor(t,e,o){if(this.dtype=e,this.shape=t.slice(),this.size=rt(t),o!=null){let n=o.length;w(n===this.size,()=>`Length of values '${n}' does not match the size inferred by the shape '${this.size}'.`)}if(e==="complex64")throw new Error("complex64 dtype TensorBuffers are not supported. Please create a TensorBuffer for the real and imaginary parts separately and call tf.complex(real, imag).");this.values=o||Ua(e,this.size),this.strides=Xe(t)}set(t,...e){e.length===0&&(e=[0]),w(e.length===this.rank,()=>`The number of provided coordinates (${e.length}) must match the rank (${this.rank})`);let o=this.locToIndex(e);this.values[o]=t}get(...t){t.length===0&&(t=[0]);let e=0;for(let n of t){if(n<0||n>=this.shape[e]){let s=`Requested out of range element at ${t}.   Buffer shape=${this.shape}`;throw new Error(s)}e++}let o=t[t.length-1];for(let n=0;n<t.length-1;++n)o+=this.strides[n]*t[n];return this.values[o]}locToIndex(t){if(this.rank===0)return 0;if(this.rank===1)return t[0];let e=t[t.length-1];for(let o=0;o<t.length-1;++o)e+=this.strides[o]*t[o];return e}indexToLoc(t){if(this.rank===0)return[];if(this.rank===1)return[t];let e=new Array(this.shape.length);for(let o=0;o<e.length-1;++o)e[o]=Math.floor(t/this.strides[o]),t-=e[o]*this.strides[o];return e[e.length-1]=t,e}get rank(){return this.shape.length}toTensor(){return Le().makeTensor(this.values,this.shape,this.dtype)}},Le=null,cs=null,L0=null;function Wf(r){Le=r}function Uf(r){cs=r}function Vf(r){L0=r}var xt=class{constructor(t,e,o,n){this.kept=!1,this.isDisposedInternal=!1,this.shape=t.slice(),this.dtype=e||"float32",this.size=rt(t),this.strides=Xe(t),this.dataId=o,this.id=n,this.rankType=this.rank<5?this.rank.toString():"higher"}get rank(){return this.shape.length}async buffer(){let t=await this.data();return cs.buffer(this.shape,this.dtype,t)}bufferSync(){return cs.buffer(this.shape,this.dtype,this.dataSync())}async array(){let t=await this.data();return Qr(this.shape,t,this.dtype==="complex64")}arraySync(){return Qr(this.shape,this.dataSync(),this.dtype==="complex64")}async data(){this.throwIfDisposed();let t=Le().read(this.dataId);if(this.dtype==="string"){let e=await t;try{return e.map(o=>ls(o))}catch{throw new Error("Failed to decode the string bytes into utf-8. To get the original bytes, call tensor.bytes().")}}return t}dataToGPU(t){return this.throwIfDisposed(),Le().readToGPU(this.dataId,t)}dataSync(){this.throwIfDisposed();let t=Le().readSync(this.dataId);if(this.dtype==="string")try{return t.map(e=>ls(e))}catch{throw new Error("Failed to decode the string bytes into utf-8. To get the original bytes, call tensor.bytes().")}return t}async bytes(){this.throwIfDisposed();let t=await Le().read(this.dataId);return this.dtype==="string"?t:new Uint8Array(t.buffer)}dispose(){this.isDisposed||(this.kerasMask&&this.kerasMask.dispose(),Le().disposeTensor(this),this.isDisposedInternal=!0)}get isDisposed(){return this.isDisposedInternal}throwIfDisposed(){if(this.isDisposed)throw new Error("Tensor is disposed.")}print(t=!1){return cs.print(this,t)}clone(){return this.throwIfDisposed(),cs.clone(this)}toString(t=!1){let e=this.dataSync();return Gf(e,this.shape,this.dtype,t)}cast(t){return this.throwIfDisposed(),cs.cast(this,t)}variable(t=!0,e,o){return this.throwIfDisposed(),Le().makeVariable(this,t,e,o)}};Object.defineProperty(xt,Symbol.hasInstance,{value:r=>!!r&&r.data!=null&&r.dataSync!=null&&r.throwIfDisposed!=null});function Bl(){return js("Tensor",()=>xt)}Bl();var pr=class extends xt{constructor(t,e,o,n){super(t.shape,t.dtype,t.dataId,n),this.trainable=e,this.name=o}assign(t){if(t.dtype!==this.dtype)throw new Error(`dtype of the new value (${t.dtype}) and previous value (${this.dtype}) must match`);if(!Xt(t.shape,this.shape))throw new Error(`shape of the new value (${t.shape}) and previous value (${this.shape}) must match`);Le().disposeTensor(this),this.dataId=t.dataId,Le().incRef(this,null)}dispose(){Le().disposeVariable(this),this.isDisposedInternal=!0}};Object.defineProperty(pr,Symbol.hasInstance,{value:r=>r instanceof xt&&r.assign!=null&&r.assign instanceof Function});var qf={};Ht(qf,{assertTypesMatch:()=>Vl,getTensorsInContainer:()=>ei,isTensorInList:()=>O0,makeTypesMatch:()=>ot});var zl;(function(r){r.R0="R0",r.R1="R1",r.R2="R2",r.R3="R3",r.R4="R4",r.R5="R5",r.R6="R6"})(zl||(zl={}));var Ll;(function(r){r.float32="float32",r.int32="int32",r.bool="int32",r.complex64="complex64"})(Ll||(Ll={}));var Gl;(function(r){r.float32="float32",r.int32="int32",r.bool="bool",r.complex64="complex64"})(Gl||(Gl={}));var Ol;(function(r){r.float32="float32",r.int32="float32",r.bool="float32",r.complex64="complex64"})(Ol||(Ol={}));var Wl;(function(r){r.float32="complex64",r.int32="complex64",r.bool="complex64",r.complex64="complex64"})(Wl||(Wl={}));var G0={float32:Ol,int32:Ll,bool:Gl,complex64:Wl};function qt(r,t){if(r==="string"||t==="string"){if(r==="string"&&t==="string")return"string";throw new Error(`Can not upcast ${r} with ${t}`)}return G0[r][t]}function Ul(r){return qt(r,"int32")}function Ya(r){return r!=null&&typeof r=="object"&&"texture"in r&&r.texture instanceof WebGLTexture}function Za(r){return typeof GPUBuffer<"u"&&r!=null&&typeof r=="object"&&"buffer"in r&&r.buffer instanceof GPUBuffer}function ot(r,t){if(r.dtype===t.dtype)return[r,t];let e=qt(r.dtype,t.dtype);return[r.cast(e),t.cast(e)]}function Vl(r,t){w(r.dtype===t.dtype,()=>`The dtypes of the first(${r.dtype}) and second(${t.dtype}) input must match`)}function O0(r,t){return t.some(e=>e.id===r.id)}function ei(r){let t=[];return Hf(r,t,new Set),t}function Hf(r,t,e){if(r==null)return;if(r instanceof xt){t.push(r);return}if(!W0(r))return;let o=r;for(let n in o){let s=o[n];e.has(s)||(e.add(s),Hf(s,t,e))}}function W0(r){return Array.isArray(r)||typeof r=="object"}function Hl(r){return r.kernelName!=null}var Qa=class{constructor(){this.registeredVariables={},this.nextTapeNodeId=0,this.numBytes=0,this.numTensors=0,this.numStringTensors=0,this.numDataBuffers=0,this.gradientDepth=0,this.kernelDepth=0,this.scopeStack=[],this.numDataMovesStack=[],this.nextScopeId=0,this.tensorInfo=new WeakMap,this.profiling=!1,this.activeProfile={newBytes:0,newTensors:0,peakBytes:0,kernels:[],result:null,get kernelNames(){return Array.from(new Set(this.kernels.map(t=>t.name)))}}}dispose(){for(let t in this.registeredVariables)this.registeredVariables[t].dispose()}},ri=class r{constructor(t){this.ENV=t,this.registry={},this.registryFactory={},this.pendingBackendInitId=0,this.state=new Qa}async ready(){if(this.pendingBackendInit!=null)return this.pendingBackendInit.then(()=>{});if(this.backendInstance!=null)return;let t=this.getSortedBackends();for(let e=0;e<t.length;e++){let o=t[e];if(await this.initializeBackend(o).success){await this.setBackend(o);return}}throw new Error("Could not initialize any backends, all backend initializations failed.")}get backend(){if(this.pendingBackendInit!=null)throw new Error(`Backend '${this.backendName}' has not yet been initialized. Make sure to await tf.ready() or await tf.setBackend() before calling other methods`);if(this.backendInstance==null){let{name:t,asyncInit:e}=this.initializeBackendsAndReturnBest();if(e)throw new Error(`The highest priority backend '${t}' has not yet been initialized. Make sure to await tf.ready() or await tf.setBackend() before calling other methods`);this.setBackend(t)}return this.backendInstance}backendNames(){return Object.keys(this.registryFactory)}findBackend(t){if(!(t in this.registry))if(t in this.registryFactory){let{asyncInit:e}=this.initializeBackend(t);if(e)return null}else return null;return this.registry[t]}findBackendFactory(t){return t in this.registryFactory?this.registryFactory[t].factory:null}registerBackend(t,e,o=1){return t in this.registryFactory?(je(`${t} backend was already registered. Reusing existing backend factory.`),!1):(this.registryFactory[t]={factory:e,priority:o},!0)}async setBackend(t){if(this.registryFactory[t]==null)throw new Error(`Backend name '${t}' not found in registry`);if(this.backendName=t,this.registry[t]==null){this.backendInstance=null;let{success:e,asyncInit:o}=this.initializeBackend(t);if(!(o?await e:e))return!1}return this.backendInstance=this.registry[t],this.setupRegisteredKernels(),this.profiler=new Xa(this.backendInstance),!0}setupRegisteredKernels(){Va(this.backendName).forEach(e=>{e.setupFunc!=null&&e.setupFunc(this.backendInstance)})}disposeRegisteredKernels(t){Va(t).forEach(o=>{o.disposeFunc!=null&&o.disposeFunc(this.registry[t])})}initializeBackend(t){let e=this.registryFactory[t];if(e==null)throw new Error(`Cannot initialize backend ${t}, no registration found.`);try{let o=e.factory();if(o&&!(o instanceof Zr)&&typeof o.then=="function"){let n=++this.pendingBackendInitId,s=o.then(i=>n<this.pendingBackendInitId?!1:(this.registry[t]=i,this.pendingBackendInit=null,!0)).catch(i=>(n<this.pendingBackendInitId||(this.pendingBackendInit=null,je(`Initialization of backend ${t} failed`),je(i.stack||i.message)),!1));return this.pendingBackendInit=s,{success:s,asyncInit:!0}}else return this.registry[t]=o,{success:!0,asyncInit:!1}}catch(o){return je(`Initialization of backend ${t} failed`),je(o.stack||o.message),{success:!1,asyncInit:!1}}}removeBackend(t){if(!(t in this.registryFactory))throw new Error(`${t} backend not found in registry`);this.backendName===t&&this.pendingBackendInit!=null&&this.pendingBackendInitId++,t in this.registry&&(this.disposeRegisteredKernels(t),this.registry[t].dispose(),delete this.registry[t]),delete this.registryFactory[t],this.backendName===t&&(this.pendingBackendInit=null,this.backendName=null,this.backendInstance=null)}getSortedBackends(){if(Object.keys(this.registryFactory).length===0)throw new Error("No backend found in registry.");return Object.keys(this.registryFactory).sort((t,e)=>this.registryFactory[e].priority-this.registryFactory[t].priority)}initializeBackendsAndReturnBest(){let t=this.getSortedBackends();for(let e=0;e<t.length;e++){let o=t[e],{success:n,asyncInit:s}=this.initializeBackend(o);if(s||n)return{name:o,asyncInit:s}}throw new Error("Could not initialize any backends, all backend initializations failed.")}moveData(t,e){let o=this.state.tensorInfo.get(e),n=o.backend,s=this.readSync(e),i=n.refCount(e);n.disposeData(e,!0),o.backend=t,t.move(e,s,o.shape,o.dtype,i),this.shouldCheckForMemLeaks()&&this.state.numDataMovesStack[this.state.numDataMovesStack.length-1]++}tidy(t,e){let o=null;if(e==null){if(typeof t!="function")throw new Error("Please provide a function to tidy()");e=t}else{if(typeof t!="string"&&!(t instanceof String))throw new Error("When calling with two arguments, the first argument to tidy() must be a string");if(typeof e!="function")throw new Error("When calling with two arguments, the 2nd argument to tidy() must be a function");o=t}let n;return this.scopedRun(()=>this.startScope(o),()=>this.endScope(n),()=>(n=e(),n instanceof Promise&&console.error("Cannot return a Promise inside of tidy."),n))}scopedRun(t,e,o){t();try{let n=o();return e(),n}catch(n){throw e(),n}}nextTensorId(){return r.nextTensorId++}nextVariableId(){return r.nextVariableId++}clone(t){let e=y.runKernel(ar,{x:t}),o={x:t},n=i=>({x:()=>{let a="float32",u={x:i},p={dtype:a};return y.runKernel(ir,u,p)}}),s=[];return this.addTapeNode(this.state.activeScope.name,o,[e],n,s,{}),e}runKernel(t,e,o){if(this.backendName==null&&this.backend,!(is(t,this.backendName)!=null))throw new Error(`Kernel '${t}' not registered for backend '${this.backendName}'`);return this.runKernelFunc({kernelName:t,inputs:e,attrs:o})}shouldCheckForMemLeaks(){return this.ENV.getBool("IS_TEST")}checkKernelForMemLeak(t,e,o){let n=this.backend.numDataIds(),s=0;o.forEach(u=>{s+=u.dtype==="complex64"?3:1});let i=this.state.numDataMovesStack[this.state.numDataMovesStack.length-1],a=n-e-s-i;if(a>0)throw new Error(`Backend '${this.backendName}' has an internal memory leak (${a} data ids) after running '${t}'`)}runKernelFunc(t){let e,o=[],n=this.isTapeOn(),s=this.state.numBytes,i=this.state.numTensors;this.shouldCheckForMemLeaks()&&this.state.numDataMovesStack.push(0);let a;this.backendName==null&&this.backend;let u,p=Hl(t)?t.kernelName:this.state.activeScope!=null?this.state.activeScope.name:"";if(Hl(t)){let{kernelName:h,inputs:b,attrs:x}=t;this.backendName==null&&this.backend;let C=is(h,this.backendName);w(C!=null,()=>`Cannot find registered kernel '${h}' for backend '${this.backendName}'`),a=()=>{let k=this.backend.numDataIds();u=C.kernelFunc({inputs:b,attrs:x,backend:this.backend});let v=Array.isArray(u)?u:[u];this.shouldCheckForMemLeaks()&&this.checkKernelForMemLeak(h,k,v);let I=v.map(T=>T.rank!=null?T:this.makeTensorFromTensorInfo(T));if(n){let T=this.getTensorsForGradient(h,b,I);o=this.saveTensorsForBackwardMode(T)}return I}}else{let{forwardFunc:h}=t,b=x=>{n&&(o=x.map(C=>this.keep(this.clone(C))))};a=()=>{let x=this.backend.numDataIds();u=this.tidy(()=>h(this.backend,b));let C=Array.isArray(u)?u:[u];return this.shouldCheckForMemLeaks()&&this.checkKernelForMemLeak(p,x,C),C}}let{inputs:l,attrs:c}=t,m=Hl(t)?null:t.backwardsFunc,f;return this.scopedRun(()=>this.state.kernelDepth++,()=>this.state.kernelDepth--,()=>{!this.ENV.getBool("DEBUG")&&!this.state.profiling?e=a():(f=this.profiler.profileKernel(p,l,()=>a()),this.ENV.getBool("DEBUG")&&this.profiler.logKernelProfile(f),e=f.outputs)}),n&&this.addTapeNode(p,l,e,m,o,c),this.state.profiling&&this.state.activeProfile.kernels.push({name:p,bytesAdded:this.state.numBytes-s,totalBytesSnapshot:this.state.numBytes,tensorsAdded:this.state.numTensors-i,totalTensorsSnapshot:this.state.numTensors,inputShapes:Object.keys(l).map(h=>l[h]!=null?l[h].shape:null),outputShapes:e.map(h=>h.shape),kernelTimeMs:f.timeMs,extraInfo:f.extraInfo}),Array.isArray(u)?e:e[0]}saveTensorsForBackwardMode(t){return t.map(o=>this.keep(this.clone(o)))}getTensorsForGradient(t,e,o){let n=Nl(t);if(n!=null){let s=n.inputsToSave||[],i=n.outputsToSave||[],a;n.saveAllInputs?(w(Array.isArray(e),()=>"saveAllInputs is true, expected inputs to be an array."),a=Object.keys(e).map(p=>e[p])):a=s.map(p=>e[p]);let u=o.filter((p,l)=>i[l]);return a.concat(u)}return[]}makeTensor(t,e,o,n){if(t==null)throw new Error("Values passed to engine.makeTensor() are null");o=o||"float32",n=n||this.backend;let s=t;o==="string"&&_e(t[0])&&(s=t.map(u=>Wr(u)));let i=n.write(s,e,o),a=new xt(e,o,i,this.nextTensorId());if(this.trackTensor(a,n),o==="string"){let u=this.state.tensorInfo.get(i),p=kl(s);this.state.numBytes+=p-u.bytes,u.bytes=p}return a}makeTensorFromDataId(t,e,o,n){o=o||"float32";let s={dataId:t,shape:e,dtype:o};return this.makeTensorFromTensorInfo(s,n)}makeTensorFromTensorInfo(t,e){let{dataId:o,shape:n,dtype:s}=t,i=new xt(n,s,o,this.nextTensorId());return this.trackTensor(i,e),i}makeVariable(t,e=!0,o,n){o=o||this.nextVariableId().toString(),n!=null&&n!==t.dtype&&(t=t.cast(n));let s=new pr(t,e,o,this.nextTensorId());if(this.state.registeredVariables[s.name]!=null)throw new Error(`Variable with name ${s.name} was already registered`);return this.state.registeredVariables[s.name]=s,this.incRef(s,this.backend),s}trackTensor(t,e){this.state.numTensors++,t.dtype==="string"&&this.state.numStringTensors++;let o=0;t.dtype!=="complex64"&&t.dtype!=="string"&&(o=t.size*rs(t.dtype)),this.state.numBytes+=o,this.state.tensorInfo.has(t.dataId)||(this.state.numDataBuffers++,this.state.tensorInfo.set(t.dataId,{backend:e||this.backend,dtype:t.dtype,shape:t.shape,bytes:o})),t instanceof pr||this.track(t)}incRef(t,e){this.trackTensor(t,e),this.backend.incRef(t.dataId)}removeDataId(t,e){this.state.tensorInfo.has(t)&&this.state.tensorInfo.get(t).backend===e&&(this.state.tensorInfo.delete(t),this.state.numDataBuffers--)}disposeTensor(t){if(!this.state.tensorInfo.has(t.dataId))return;let e=this.state.tensorInfo.get(t.dataId);if(this.state.numTensors--,t.dtype==="string"&&(this.state.numStringTensors--,this.state.numBytes-=e.bytes),t.dtype!=="complex64"&&t.dtype!=="string"){let o=t.size*rs(t.dtype);this.state.numBytes-=o}e.backend.disposeData(t.dataId)&&this.removeDataId(t.dataId,e.backend)}disposeVariables(){for(let t in this.state.registeredVariables){let e=this.state.registeredVariables[t];this.disposeVariable(e)}}disposeVariable(t){this.disposeTensor(t),this.state.registeredVariables[t.name]!=null&&delete this.state.registeredVariables[t.name]}memory(){let t=this.backend.memory();return t.numTensors=this.state.numTensors,t.numDataBuffers=this.state.numDataBuffers,t.numBytes=this.state.numBytes,this.state.numStringTensors>0&&(t.unreliable=!0,t.reasons==null&&(t.reasons=[]),t.reasons.push("Memory usage by string tensors is approximate (2 bytes per character)")),t}async profile(t){this.state.profiling=!0;let e=this.state.numBytes,o=this.state.numTensors;this.state.activeProfile.kernels=[],this.state.activeProfile.result=await t(),this.state.profiling=!1,this.state.activeProfile.peakBytes=Math.max(...this.state.activeProfile.kernels.map(n=>n.totalBytesSnapshot)),this.state.activeProfile.newBytes=this.state.numBytes-e,this.state.activeProfile.newTensors=this.state.numTensors-o;for(let n of this.state.activeProfile.kernels)n.kernelTimeMs=await n.kernelTimeMs,n.extraInfo=await n.extraInfo;return this.state.activeProfile}isTapeOn(){return this.state.gradientDepth>0&&this.state.kernelDepth===0}addTapeNode(t,e,o,n,s,i){let a={id:this.state.nextTapeNodeId++,kernelName:t,inputs:e,outputs:o,saved:s},u=Nl(t);u!=null&&(n=u.gradFunc),n!=null&&(a.gradient=p=>(p=p.map((l,c)=>{if(l==null){let m=o[c],f=ns(m.size,m.dtype);return this.makeTensor(f,m.shape,m.dtype)}return l}),n(p.length>1?p:p[0],s,i))),this.state.activeTape.push(a)}keep(t){return t.kept=!0,t}startTape(){this.state.gradientDepth===0&&(this.state.activeTape=[]),this.state.gradientDepth++}endTape(){this.state.gradientDepth--}startScope(t){let e={track:[],name:"unnamed scope",id:this.state.nextScopeId++};t&&(e.name=t),this.state.scopeStack.push(e),this.state.activeScope=e}endScope(t){let e=ei(t),o=new Set(e.map(s=>s.id));for(let s=0;s<this.state.activeScope.track.length;s++){let i=this.state.activeScope.track[s];!i.kept&&!o.has(i.id)&&i.dispose()}let n=this.state.scopeStack.pop();this.state.activeScope=this.state.scopeStack.length===0?null:this.state.scopeStack[this.state.scopeStack.length-1],e.forEach(s=>{!s.kept&&s.scopeId===n.id&&this.track(s)})}gradients(t,e,o,n=!1){if(w(e.length>0,()=>"gradients() received an empty list of xs."),o!=null&&o.dtype!=="float32")throw new Error(`dy must have 'float32' dtype, but has '${o.dtype}'`);let s=this.scopedRun(()=>this.startTape(),()=>this.endTape(),()=>this.tidy("forward",t));w(s instanceof xt,()=>"The result y returned by f() must be a tensor.");let i=Bf(this.state.activeTape,e,s);if(!n&&i.length===0&&e.length>0)throw new Error("Cannot compute gradient of y=f(x) with respect to x. Make sure that the f you passed encloses all operations that lead from x to y.");return this.tidy("backward",()=>{let a={};a[s.id]=o??U0(s.shape),zf(a,i,p=>this.tidy(p),V0);let u=e.map(p=>a[p.id]);return this.state.gradientDepth===0&&(this.state.activeTape.forEach(p=>{for(let l of p.saved)l.dispose()}),this.state.activeTape=null),{value:s,grads:u}})}customGrad(t){return w(Ke(t),()=>"The f passed in customGrad(f) must be a function."),(...e)=>{w(e.every(a=>a instanceof xt),()=>"The args passed in customGrad(f)(x1, x2,...) must all be tensors");let o,n={};e.forEach((a,u)=>{n[u]=a});let s=(a,u)=>(o=t(...e,u),w(o.value instanceof xt,()=>"The function f passed in customGrad(f) must return an object where `obj.value` is a tensor"),w(Ke(o.gradFunc),()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function."),o.value),i=(a,u)=>{let p=o.gradFunc(a,u),l=Array.isArray(p)?p:[p];w(l.length===e.length,()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function that returns the same number of tensors as inputs passed to f(...)."),w(l.every(m=>m instanceof xt),()=>"The function f passed in customGrad(f) must return an object where `obj.gradFunc` is a function that returns a list of only tensors.");let c={};return l.forEach((m,f)=>{c[f]=()=>m}),c};return this.runKernelFunc({forwardFunc:s,backwardsFunc:i,inputs:n})}}readSync(t){return this.state.tensorInfo.get(t).backend.readSync(t)}read(t){return this.state.tensorInfo.get(t).backend.read(t)}readToGPU(t,e){return this.state.tensorInfo.get(t).backend.readToGPU(t,e)}async time(t){let e=so(),o=await this.backend.time(t);return o.wallMs=so()-e,o}track(t){return this.state.activeScope!=null&&(t.scopeId=this.state.activeScope.id,this.state.activeScope.track.push(t)),t}get registeredVariables(){return this.state.registeredVariables}reset(){this.pendingBackendInitId++,this.state.dispose(),this.ENV.reset(),this.state=new Qa;for(let t in this.registry)this.disposeRegisteredKernels(t),this.registry[t].dispose(),delete this.registry[t];this.backendName=null,this.backendInstance=null,this.pendingBackendInit=null}};ri.nextTensorId=0;ri.nextVariableId=0;function U0(r){let t=Ks(rt(r),"float32");return y.makeTensor(t,r,"float32")}function ql(){let r=$l();if(r._tfengine==null){let t=new Xs(r);r._tfengine=new ri(t)}return wf(r._tfengine.ENV),Wf(()=>r._tfengine),r._tfengine}var y=ql();function V0(r,t){let e={a:r,b:t};return y.runKernel("Add",e)}function Lt(r,t){let e=r;if(Dt(r))return t==="string"?[]:[r.length];if(Ya(r)){let n=r.channels||"RGBA";return[r.height,r.width*n.length]}else if(Za(r))return[r.buffer.size/(t==null?4:rs(t))];if(!Array.isArray(r))return[];let o=[];for(;Array.isArray(e)||Dt(e)&&t!=="string";)o.push(e.length),e=e[0];return Array.isArray(r)&&L().getBool("TENSORLIKE_CHECK_SHAPE_CONSISTENCY")&&Xf(r,o,[]),o}function Xf(r,t,e){if(e=e||[],!Array.isArray(r)&&!Dt(r)){w(t.length===0,()=>`Element arr[${e.join("][")}] is a primitive, but should be an array/TypedArray of ${t[0]} elements`);return}w(t.length>0,()=>`Element arr[${e.join("][")}] should be a primitive, but is an array of ${r.length} elements`),w(r.length===t[0],()=>`Element arr[${e.join("][")}] should have ${t[0]} elements, but has ${r.length} elements`);let o=t.slice(1);for(let n=0;n<r.length;++n)Xf(r[n],o,e.concat(n))}function Kf(r,t,e,o){if(r!=="string_or_numeric"){if(r==null)throw new Error("Expected dtype cannot be null.");if(r!=="numeric"&&r!==t||r==="numeric"&&t==="string")throw new Error(`Argument '${e}' passed to '${o}' must be ${r} tensor, but got ${t} tensor`)}}function d(r,t,e,o="numeric"){if(r instanceof Bl())return Kf(o,r.dtype,t,e),r;let n=Gr(r);if(n!=="string"&&["bool","int32","float32"].indexOf(o)>=0&&(n=o),Kf(o,n,t,e),r==null||!Dt(r)&&!Array.isArray(r)&&typeof r!="number"&&typeof r!="boolean"&&typeof r!="string"){let u=r==null?"null":r.constructor.name;throw new Error(`Argument '${t}' passed to '${e}' must be a Tensor or TensorLike, but got '${u}'`)}let s=Lt(r,n);!Dt(r)&&!Array.isArray(r)&&(r=[r]);let a=n!=="string"?ps(r,n):ze(r,[],!0);return y.makeTensor(a,s,n)}function lr(r,t,e,o="numeric"){if(!Array.isArray(r))throw new Error(`Argument ${t} passed to ${e} must be a \`Tensor[]\` or \`TensorLike[]\``);return r.map((s,i)=>d(s,`${t}[${i}]`,e,o))}var jf="__op";function g(r){let t=Object.keys(r);if(t.length!==1)throw new Error(`Please provide an object with a single key (operation name) mapping to a function. Got an object with ${t.length} keys.`);let e=t[0],o=r[e];e.endsWith("_")&&(e=e.substring(0,e.length-1)),e=e+jf;let n=(...s)=>{y.startScope(e);try{let i=o(...s);return to(i)&&console.error("Cannot return a Promise inside of tidy."),y.endScope(i),i}catch(i){throw y.endScope(null),i}};return Object.defineProperty(n,"name",{value:e,configurable:!0}),n}function H0(r,t){let e=d(r,"x","cast");if(!vl(t))throw new Error(`Failed to cast to unknown dtype ${t}`);if(t==="string"&&e.dtype!=="string"||t!=="string"&&e.dtype==="string")throw new Error("Only strings can be casted to strings");let o={x:e},n={dtype:t};return y.runKernel(ir,o,n)}var _=g({cast_:H0});function q0(r,t){let e=d(r,"a","mul"),o=d(t,"b","mul");[e,o]=ot(e,o);let n={a:e,b:o};return y.runKernel(Fr,n)}var $=g({mul_:q0});function K0(r,t=0){let o={x:d(r,"x","step")},n={alpha:t};return y.runKernel(ts,o,n)}var cr=g({step_:K0});var Ja={kernelName:"Abs",inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(r,cr(_(e,"float32"),-1))}}};function X0(r,t){let e=d(r,"a","floorDiv"),o=d(t,"b","floorDiv");[e,o]=ot(e,o);let n={a:e,b:o};return y.runKernel(Tr,n)}var Kl=g({floorDiv_:X0});function j0(r,t){let e=d(r,"a","div"),o=d(t,"b","div");if([e,o]=ot(e,o),e.dtype==="int32"&&o.dtype==="int32")return Kl(e,o);let n={a:e,b:o},s={};return y.runKernel(un,n,s)}var V=g({div_:j0});function Y0(r){let e={x:d(r,"x","neg")};return y.runKernel("Neg",e)}var lt=g({neg_:Y0});function Yt(r,t,e,o){if(o==null)o=Gr(r);else if(o==="complex64")throw new Error("Cannot construct a complex64 tensor directly. Please use tf.complex(real, imag).");if(Za(r)||Ya(r)){if(o!=="float32"&&o!=="int32")throw new Error(`Creating tensor from GPU data only supports 'float32'|'int32' dtype, while the dtype is ${o}.`);return y.backend.createTensorFromGPUData(r,t||e,o)}if(!Dt(r)&&!Array.isArray(r)&&typeof r!="number"&&typeof r!="boolean"&&typeof r!="string")throw new Error("values passed to tensor(values) must be a number/boolean/string or an array of numbers/booleans/strings, or a TypedArray");if(t!=null){wt(t);let n=rt(t),s=rt(e);w(n===s,()=>`Based on the provided shape, [${t}], the tensor should have ${n} values but has ${s}`);for(let i=0;i<e.length;++i){let a=e[i],u=i===e.length-1?a!==rt(t.slice(i)):!0;w(e[i]===t[i]||!u,()=>`Error creating a new Tensor. Inferred shape (${e}) does not match the provided shape (${t}). `)}}return!Dt(r)&&!Array.isArray(r)&&(r=[r]),t=t||e,r=o!=="string"?ps(r,o):ze(r,[],!0),y.makeTensor(r,t,o)}function X(r,t){if((Dt(r)&&t!=="string"||Array.isArray(r))&&t!=="complex64")throw new Error("Error creating a new Scalar: value must be a primitive (number|boolean|string)");if(t==="string"&&Dt(r)&&!(r instanceof Uint8Array))throw new Error("When making a scalar from encoded string, the value must be `Uint8Array`.");return Yt(r,[],[],t)}function Z0(r){let e={x:d(r,"x","sqrt","float32")};return y.runKernel(_r,e)}var At=g({sqrt_:Z0});function Q0(r){let t=d(r,"x","square"),e={};return y.runKernel("Square",{x:t},e)}var tt=g({square_:Q0});function J0(r,t){let e=d(r,"a","sub"),o=d(t,"b","sub");[e,o]=ot(e,o);let n={a:e,b:o};return y.runKernel("Sub",n)}var U=g({sub_:J0});var Yf={kernelName:Bo,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>{let o=tt(_(e,"float32")),n=At(U(X(1),o));return lt(V(r,n))}}}};var Zf={kernelName:zo,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>{let o=At(U(tt(_(e,"float32")),1));return V(r,o)}}}};var $e={};Ht($e,{assertAndGetBroadcastShape:()=>Q,getBroadcastDims:()=>Qf,getReductionAxes:()=>mt});function Qf(r,t){let e=r.length,o=[];for(let n=0;n<e;n++){let s=e-1-n,i=r[s]||1;(t[t.length-1-n]||1)>1&&i===1&&o.unshift(s)}return o}function mt(r,t){let e=[];for(let o=0;o<t.length;o++){let n=r[r.length-o-1],s=t.length-o-1,i=t[s];(n==null||n===1&&i>1)&&e.unshift(s)}return e}function Q(r,t){let e=Math.max(r.length,t.length),o=new Array(e);for(let n=0;n<e;n++){let s=r[r.length-n-1];s==null&&(s=1);let i=t[t.length-n-1];if(i==null&&(i=1),s===1)o[e-n-1]=i;else if(i===1)o[e-n-1]=s;else if(s!==i){let a=`Operands could not be broadcast together with shapes ${r} and ${t}.`;throw Error(a)}else o[e-n-1]=s}return o}function t1(r,t){let o={x:d(r,"x","reshape","string_or_numeric")},n={shape:t};return y.runKernel(Mn,o,n)}var E=g({reshape_:t1});function e1(r,t=null,e=!1){let o=d(r,"x","sum");o.dtype==="bool"&&(o=_(o,"int32"));let n={x:o},s={axis:t,keepDims:e};return y.runKernel("Sum",n,s)}var K=g({sum_:e1});var Jf={kernelName:"Add",inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=Q(e.shape,o.shape);return{a:()=>{let a=r,u=mt(e.shape,n);return u.length>0&&(a=K(a,u)),E(a,e.shape)},b:()=>{let a=r,u=mt(o.shape,n);return u.length>0&&(a=K(a,u)),E(a,o.shape)}}}};var td={kernelName:Lo,saveAllInputs:!0,gradFunc:(r,t)=>{let e={};return t.forEach((o,n)=>{e[n]=()=>r.clone()}),e}};function r1(r){let e={x:d(r,"x","zerosLike")};return y.runKernel(Jn,e)}var Z=g({zerosLike_:r1});var ed={kernelName:Go,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>Z(e)}}};var rd={kernelName:Oo,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>Z(e)}}};var od={kernelName:Wo,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,At(U(X(1),tt(_(e,"float32")))))}}};function o1(r,t){let e=d(r,"a","add"),o=d(t,"b","add");[e,o]=ot(e,o);let n={a:e,b:o};return y.runKernel("Add",n)}var O=g({add_:o1});var nd={kernelName:Uo,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>{let o=At(O(X(1),tt(_(e,"float32"))));return V(r,o)}}}};var sd={kernelName:qo,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=Q(e.shape,o.shape);return{a:()=>{let a=O(tt(e),tt(o)),u=$(r,V(o,a)),p=mt(e.shape,n);return p.length>0&&(u=K(u,p)),E(u,e.shape)},b:()=>{let a=O(tt(e),tt(o)),u=lt($(r,V(e,a))),p=mt(o.shape,n);return p.length>0&&(u=K(u,p)),E(u,o.shape)}}}};var id={kernelName:Vo,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,O(tt(_(e,"float32")),1))}}};var ad={kernelName:Ho,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,U(X(1),tt(_(e,"float32"))))}}};function n1(r,t,e,o,n="NHWC",s){let i=r[3],a=[...t,i],u=pd(n);return io(r,a,e,s,o,null,null,u)}function jl(r,t,e,o,n,s,i="channelsLast"){let[a,u]=oi(t),p;if(i==="channelsLast")p=[a,u,r[3],r[3]];else if(i==="channelsFirst")p=[a,u,r[1],r[1]];else throw new Error(`Unknown dataFormat ${i}`);return io(r,p,e,o,n,s,!1,i)}function s1(r,t,e,o,n,s,i="NDHWC"){let[a,u,p]=Xl(t),l,c;if(i==="NDHWC")c="channelsLast",l=[a,u,p,r[4],r[4]];else if(i==="NCDHW")c="channelsFirst",l=[a,u,p,r[1],r[1]];else throw new Error(`Unknown dataFormat ${i}`);return ud(r,l,e,o,n,!1,c,s)}function io(r,t,e,o,n,s,i=!1,a="channelsLast"){let[u,p,l,c]=[-1,-1,-1,-1];if(a==="channelsLast")[u,p,l,c]=r;else if(a==="channelsFirst")[u,c,p,l]=r;else throw new Error(`Unknown dataFormat ${a}`);let[m,f,,h]=t,[b,x]=oi(e),[C,k]=oi(o),v=ms(m,C),I=ms(f,k),{padInfo:T,outHeight:R,outWidth:M}=u1(n,p,l,b,x,v,I,s,a),z=i?h*c:h,B;return a==="channelsFirst"?B=[u,z,R,M]:a==="channelsLast"&&(B=[u,R,M,z]),{batchSize:u,dataFormat:a,inHeight:p,inWidth:l,inChannels:c,outHeight:R,outWidth:M,outChannels:z,padInfo:T,strideHeight:b,strideWidth:x,filterHeight:m,filterWidth:f,effectiveFilterHeight:v,effectiveFilterWidth:I,dilationHeight:C,dilationWidth:k,inShape:r,outShape:B,filterShape:t}}function ud(r,t,e,o,n,s=!1,i="channelsLast",a){let[u,p,l,c,m]=[-1,-1,-1,-1,-1];if(i==="channelsLast")[u,p,l,c,m]=r;else if(i==="channelsFirst")[u,m,p,l,c]=r;else throw new Error(`Unknown dataFormat ${i}`);let[f,h,b,,x]=t,[C,k,v]=Xl(e),[I,T,R]=Xl(o),M=ms(f,I),z=ms(h,T),B=ms(b,R),{padInfo:H,outDepth:Y,outHeight:J,outWidth:it}=p1(n,p,l,c,C,k,v,M,z,B,a),ut=s?x*m:x,pt;return i==="channelsFirst"?pt=[u,ut,Y,J,it]:i==="channelsLast"&&(pt=[u,Y,J,it,ut]),{batchSize:u,dataFormat:i,inDepth:p,inHeight:l,inWidth:c,inChannels:m,outDepth:Y,outHeight:J,outWidth:it,outChannels:ut,padInfo:H,strideDepth:C,strideHeight:k,strideWidth:v,filterDepth:f,filterHeight:h,filterWidth:b,effectiveFilterDepth:M,effectiveFilterHeight:z,effectiveFilterWidth:B,dilationDepth:I,dilationHeight:T,dilationWidth:R,inShape:r,outShape:pt,filterShape:t}}function i1(r,t,e,o,n){o==null&&(o=Yl(r,t,e));let s=r[0],i=r[1],a=ni((s-t+2*o)/e+1,n),u=ni((i-t+2*o)/e+1,n);return[a,u]}function a1(r,t,e,o,n,s){n==null&&(n=Yl(r,t[0],o[0]));let i=[0,0,0,e];for(let a=0;a<3;a++)r[a]+2*n>=t[a]&&(i[a]=ni((r[a]-t[a]+2*n)/o[a]+1,s));return i}function Yl(r,t,e,o=1){let n=ms(t,o);return Math.floor((r[0]*(e-1)-e+n)/2)}function oi(r){return typeof r=="number"?[r,r,r]:r.length===2?[r[0],r[1],1]:r}function Xl(r){return typeof r=="number"?[r,r,r]:r}function ms(r,t){return t<=1?r:r+(r-1)*(t-1)}function u1(r,t,e,o,n,s,i,a,u){let p,l,c;if(typeof r=="number"){p={top:r,bottom:r,left:r,right:r,type:r===0?"VALID":"NUMBER"};let f=i1([t,e],s,o,r,a);l=f[0],c=f[1]}else if(r==="same"){l=Math.ceil(t/o),c=Math.ceil(e/n);let m=Math.max(0,(l-1)*o+s-t),f=Math.max(0,(c-1)*n+i-e),h=Math.floor(m/2),b=m-h,x=Math.floor(f/2),C=f-x;p={top:h,bottom:b,left:x,right:C,type:"SAME"}}else if(r==="valid")p={top:0,bottom:0,left:0,right:0,type:"VALID"},l=Math.ceil((t-s+1)/o),c=Math.ceil((e-i+1)/n);else if(typeof r=="object"){let m=u==="channelsLast"?r[1][0]:r[2][0],f=u==="channelsLast"?r[1][1]:r[2][1],h=u==="channelsLast"?r[2][0]:r[3][0],b=u==="channelsLast"?r[2][1]:r[3][1];p={top:m,bottom:f,left:h,right:b,type:m===0&&f===0&&h===0&&b===0?"VALID":"EXPLICIT"},l=ni((t-s+m+f)/o+1,a),c=ni((e-i+h+b)/n+1,a)}else throw Error(`Unknown padding parameter: ${r}`);return{padInfo:p,outHeight:l,outWidth:c}}function p1(r,t,e,o,n,s,i,a,u,p,l){let c,m,f,h;if(r==="valid"&&(r=0),typeof r=="number"){c={top:r,bottom:r,left:r,right:r,front:r,back:r,type:r===0?"VALID":"NUMBER"};let x=a1([t,e,o,1],[a,u,p],1,[n,s,i],r,l);m=x[0],f=x[1],h=x[2]}else if(r==="same"){m=Math.ceil(t/n),f=Math.ceil(e/s),h=Math.ceil(o/i);let b=(m-1)*n+a-t,x=(f-1)*s+u-e,C=(h-1)*i+p-o,k=Math.floor(b/2),v=b-k,I=Math.floor(x/2),T=x-I,R=Math.floor(C/2),M=C-R;c={top:I,bottom:T,left:R,right:M,front:k,back:v,type:"SAME"}}else throw Error(`Unknown padding parameter: ${r}`);return{padInfo:c,outDepth:m,outHeight:f,outWidth:h}}function ni(r,t){if(!t)return Math.trunc(r);switch(t){case"round":return Math.round(r);case"ceil":return Math.ceil(r);case"floor":return Math.floor(r);default:throw new Error(`Unknown roundingMode ${t}`)}}function ge(r){let[t,e,o]=oi(r);return t===1&&e===1&&o===1}function Bt(r,t){return ge(r)||ge(t)}function Ye(r){return oi(r).every(t=>t>0)}function pd(r){if(r==="NHWC")return"channelsLast";if(r==="NCHW")return"channelsFirst";throw new Error(`Unknown dataFormat ${r}`)}function ft(r,t,e){if(e!=null){if(typeof t=="string")throw Error(`Error in ${r}: pad must be an integer when using dimRoundingMode ${e} but got pad ${t}.`);if(typeof t=="number")w(ur(t),()=>`Error in ${r}: pad must be an integer when using dimRoundingMode ${e} but got pad ${t}.`);else if(typeof t=="object")t.forEach(o=>{o.forEach(n=>{w(ur(n),()=>`Error in ${r}: pad must be an integer when using dimRoundingMode ${e} but got pad ${n}.`)})});else throw Error(`Error in ${r}: Unknown padding parameter: ${t}`)}}function l1(r,t,e,o,n,s){let i=d(r,"dy","avgPool3dGrad"),a=d(t,"input","avgPool3dGrad"),u=i,p=a,l=!1;a.rank===4&&(l=!0,u=E(i,[1,i.shape[0],i.shape[1],i.shape[2],i.shape[3]]),p=E(a,[1,a.shape[0],a.shape[1],a.shape[2],a.shape[3]])),w(u.rank===5,()=>`Error in avgPool3dGrad: dy must be rank 5 but got rank ${u.rank}.`),w(p.rank===5,()=>`Error in avgPool3dGrad: input must be rank 5 but got rank ${p.rank}.`),ft("avgPool3dGrad",n,s);let c={dy:u,input:p},m={filterSize:e,strides:o,pad:n,dimRoundingMode:s},f=y.runKernel(_i,c,m);return l?E(f,[f.shape[1],f.shape[2],f.shape[3],f.shape[4]]):f}var ld=g({avgPool3dGrad_:l1});var cd={kernelName:Xo,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{filterSize:n,strides:s,pad:i,dimRoundingMode:a}=e;return{x:()=>ld(r,o,n,s,i,a)}}};function c1(r,t,e,o,n){let s=d(r,"dy","avgPoolGrad"),i=d(t,"input","avgPoolGrad");w(i.rank===s.rank,()=>`Rank of input (${i.rank}) does not match rank of dy (${s.rank})`);let a=i,u=s,p=!1;i.rank===3&&(p=!0,a=E(i,[1,i.shape[0],i.shape[1],i.shape[2]]),u=E(s,[1,s.shape[0],s.shape[1],s.shape[2]])),w(u.rank===4,()=>`Error in avgPoolGrad: dy must be rank 4 but got rank ${u.rank}.`),w(a.rank===4,()=>`Error in avgPoolGrad: input must be rank 4 but got rank ${a.rank}.`);let l={dy:u,input:a},c={filterSize:e,strides:o,pad:n},m=y.runKernel(Mi,l,c);return p?E(m,[m.shape[1],m.shape[2],m.shape[3]]):m}var md=g({avgPoolGrad_:c1});var fd={kernelName:Ko,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{filterSize:n,strides:s,pad:i}=e;return{x:()=>md(r,o,n,s,i)}}};function m1(r,t,e=!1,o=!1){let n=d(r,"a","matMul"),s=d(t,"b","matMul");[n,s]=ot(n,s);let i={a:n,b:s},a={transposeA:e,transposeB:o};return y.runKernel(jo,i,a)}var nt=g({matMul_:m1});var dd={kernelName:jo,inputsToSave:["a","b"],gradFunc:(r,t,e)=>{let[o,n]=t,{transposeA:s,transposeB:i}=e;return!s&&!i?{a:()=>nt(r,n,!1,!0),b:()=>nt(o,r,!0,!1)}:!s&&i?{a:()=>nt(r,n,!1,!1),b:()=>nt(r,o,!0,!1)}:s&&!i?{a:()=>nt(n,r,!1,!0),b:()=>nt(o,r,!1,!1)}:{a:()=>nt(n,r,!0,!0),b:()=>nt(r,o,!0,!0)}}};function f1(r,t,e){let o=d(r,"x","spaceToBatchND");w(o.rank>=1+t.length,()=>`input rank ${o.rank} should be > than [blockShape] ${t.length}`),w(e.length===t.length,()=>`paddings.shape[0] ${e.length} must be equal to [blockShape] ${t.length}`),w(o.shape.reduce((i,a,u)=>u>0&&u<=t.length?i&&(a+e[u-1][0]+e[u-1][1])%t[u-1]===0:i,!0),()=>`input spatial dimensions ${o.shape.slice(1)} with paddings ${e.toString()} must be divisible by blockShapes ${t.toString()}`);let n={x:o},s={blockShape:t,paddings:e};return y.runKernel(qn,n,s)}var si=g({spaceToBatchND_:f1});var hd={kernelName:Yo,gradFunc:(r,t,e)=>{let{blockShape:o,crops:n}=e;return{x:()=>si(r,o,n)}}};var gd={kernelName:of,gradFunc:(r,t,e)=>{let o=e,n=o.inputShape,s=o.shape,i=Array.from(s);for(let u=n.length-1;u>=0;u--)if(n[u]===s[u])i[u]=1;else if(n[u]!==1)throw new Error(`broadcastTo(): [${n}] cannot be broadcast to [${s}].`);let a=[];for(let u=0;u<i.length;u++)i[u]>1&&a.push(u);return{x:()=>K(r,a,!0)}}};var xd={kernelName:ir,gradFunc:r=>({x:()=>r.clone()})};var yd={kernelName:Er,gradFunc:r=>({x:()=>Z(r)})};function d1(r,t){let e=d(r,"a","greaterEqual","string_or_numeric"),o=d(t,"b","greaterEqual","string_or_numeric");[e,o]=ot(e,o),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(Dr,n)}var mr=g({greaterEqual_:d1});function h1(r,t){let e=d(r,"a","lessEqual","string_or_numeric"),o=d(t,"b","lessEqual","string_or_numeric");[e,o]=ot(e,o),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(wn,n)}var Ge=g({lessEqual_:h1});function g1(r,t){let e=d(r,"a","logicalAnd","bool"),o=d(t,"b","logicalAnd","bool");Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(ua,n)}var Ze=g({logicalAnd_:g1});function x1(r){let e={x:d(r,"x","clone","string_or_numeric")};return y.runKernel(ar,e)}var Oe=g({clone_:x1});function y1(r,t){let e=d(r,"broadcastTo","x"),o=e.shape;if(wt(t),t.length<e.rank)throw new Error(`broadcastTo(): shape.length=${t.length} < input.rank=${e.rank}.`);if(t.length>e.rank){let p=e.shape.slice();for(;p.length<t.length;)p.unshift(1);e=E(e,p)}let n=e.shape,s=Array.from(t);for(let p=t.length-1;p>=0;p--)if(n[p]===t[p])s[p]=1;else if(e.shape[p]!==1)throw new Error(`broadcastTo(): [${o}] cannot be broadcast to [${t}].`);if(s.map((p,l)=>p>1?l:-1).filter(p=>p>=0).length===0)return Oe(e);let a={x:e},u={reps:s};return y.runKernel(zr,a,u)}var ao=g({broadcastTo_:y1});function b1(r,t,e){let o=d(t,"a","where"),n=d(e,"b","where"),s=d(r,"condition","where","bool"),i=Q(Q(s.shape,o.shape),n.shape),a=ao(s,i),u=ao(o,i),p=ao(n,i),l={condition:a,t:u,e:p};return y.runKernel(On,l)}var It=g({where_:b1});var bd={kernelName:Zo,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{clipValueMin:n,clipValueMax:s}=e;return{x:()=>It(Ze(mr(o,n),Ge(o,s)),r,Z(r))}}};var wd={kernelName:Qo,inputsToSave:["x"],gradFunc:Ja.gradFunc};function w1(r,t,e=0){let n={x:d(r,"x","split")},s={numOrSizeSplits:t,axis:e};return y.runKernel(Kn,n,s)}var Qe=g({split_:w1});var Sd={kernelName:Jo,saveAllInputs:!0,gradFunc:(r,t,e)=>{let o=t.map(u=>u.shape),{axis:n}=e,s=Rt(n,t[0].shape)[0],i=o.map(u=>u[s]);return Qe(r,i,s).map(u=>()=>u)}};function S1(r,t,e,o,n,s="NHWC",i){let a=r;r.rank===3&&(a=E(r,[1,r.shape[0],r.shape[1],r.shape[2]]));let u=t;u.rank===3&&(u=E(t,[1,t.shape[0],t.shape[1],t.shape[2]])),w(a.rank===4,()=>`Error in conv2dDerFilter: input must be rank 4, but got shape ${a.shape}.`),w(u.rank===4,()=>`Error in conv2dDerFilter: dy must be rank 4, but got shape ${u.shape}.`),w(e.length===4,()=>`Error in conv2dDerFilter: filterShape must be length 4, but got ${e}.`);let p=s==="NHWC"?a.shape[3]:a.shape[1],l=s==="NHWC"?u.shape[3]:u.shape[1];w(p===e[2],()=>`Error in conv2dDerFilter: depth of input ${p}) must match input depth in filter (${e[2]}.`),w(l===e[3],()=>`Error in conv2dDerFilter: depth of dy (${l}) must match output depth for filter (${e[3]}).`),ft("conv2dDerFilter",n,i);let c={x:a,dy:u},m={strides:o,pad:n,dataFormat:s,dimRoundingMode:i,filterShape:e};return y.runKernel(Gi,c,m)}var fs=g({conv2DBackpropFilter_:S1});function C1(r,t,e,o,n,s="NHWC",i){w(r.length===t.rank,()=>`Length of inShape (${r.length}) and rank of dy (${t.rank}) must match`);let a=r,u=t,p=!1;t.rank===3&&(p=!0,u=E(t,[1,t.shape[0],t.shape[1],t.shape[2]]),a=[1,r[0],r[1],r[2]]),w(a.length===4,()=>`Error in conv2dDerInput: inShape must be length 4, but got length ${a.length}.`),w(u.rank===4,()=>`Error in conv2dDerInput: dy must be rank 4, but got rank ${u.rank}`),w(e.rank===4,()=>`Error in conv2dDerInput: filter must be rank 4, but got rank ${e.rank}`);let l=s==="NHWC"?a[3]:a[1],c=s==="NHWC"?u.shape[3]:u.shape[1];w(l===e.shape[2],()=>`Error in conv2dDerInput: depth of input (${l}) must match input depth for filter ${e.shape[2]}.`),w(c===e.shape[3],()=>`Error in conv2dDerInput: depth of output (${c}) must match output depth for filter ${e.shape[3]}.`),ft("conv2dDerInput",n,i);let m={dy:u,filter:e},f={strides:o,pad:n,dataFormat:s,dimRoundingMode:i,inputShape:a},h=y.runKernel(en,m,f);return p?E(h,[h.shape[1],h.shape[2],h.shape[3]]):h}var ds=g({conv2DBackpropInput_:C1});var Cd={kernelName:tn,inputsToSave:["x","filter"],gradFunc:(r,t,e)=>{let[o,n]=t,{dilations:s,strides:i,pad:a,dataFormat:u}=e;return w(ge(s),()=>`Error in gradient of conv2D: dilation rates greater than 1 are not yet supported in gradients. Got dilations '${s}'`),{x:()=>ds(o.shape,r,n,i,a,u),filter:()=>fs(o,r,n.shape,i,a,u)}}};function v1(r,t,e,o,n="NHWC",s=[1,1],i){let a=d(r,"x","conv2d","float32"),u=d(t,"filter","conv2d","float32"),p=a,l=!1;a.rank===3&&(l=!0,p=E(a,[1,a.shape[0],a.shape[1],a.shape[2]])),w(p.rank===4,()=>`Error in conv2d: input must be rank 4, but got rank ${p.rank}.`),w(u.rank===4,()=>`Error in conv2d: filter must be rank 4, but got rank ${u.rank}.`),ft("conv2d",o,i);let c=n==="NHWC"?p.shape[3]:p.shape[1];w(c===u.shape[2],()=>`Error in conv2d: depth of input (${c}) must match input depth for filter ${u.shape[2]}.`),w(Bt(e,s),()=>`Error in conv2D: Either strides or dilations must be 1. Got strides ${e} and dilations '${s}'`),w(Ye(s),()=>"Error in conv2D: Dilated rates should be larger than 0."),w(Ye(e),()=>"Error in conv2D: Strides should be larger than 0.");let m={x:p,filter:u},f={strides:e,pad:o,dataFormat:n,dilations:s,dimRoundingMode:i},h=y.runKernel(tn,m,f);return l?E(h,[h.shape[1],h.shape[2],h.shape[3]]):h}var fr=g({conv2d_:v1});var vd={kernelName:en,inputsToSave:["dy","filter"],gradFunc:(r,t,e)=>{let[o,n]=t,{strides:s,pad:i,dataFormat:a,dimRoundingMode:u}=e;return{dy:()=>fr(r,n,s,i,a,1,u),filter:()=>fs(r,o,n.shape,s,i,a,u)}}};function k1(r,t,e,o,n){let s=r;r.rank===4&&(s=E(r,[1,r.shape[0],r.shape[1],r.shape[2],r.shape[3]]));let i=t;i.rank===4&&(i=E(t,[1,t.shape[0],t.shape[1],t.shape[2],t.shape[3]])),w(s.rank===5,()=>`Error in conv3dDerFilter: input must be rank 5, but got shape ${s.shape}.`),w(i.rank===5,()=>`Error in conv3dDerFilter: dy must be rank 5, but got shape ${i.shape}.`),w(e.length===5,()=>`Error in conv3dDerFilter: filterShape must be length 5, but got ${e}.`),w(s.shape[4]===e[3],()=>`Error in conv3dDerFilter: depth of input ${s.shape[4]}) must match input depth in filter (${e[3]}.`),w(i.shape[4]===e[4],()=>`Error in conv3dDerFilter: depth of dy (${i.shape[4]}) must match output depth for filter (${e[4]}).`);let a={x:s,dy:i},u={strides:o,pad:n,filterShape:e};return y.runKernel(Oi,a,u)}var kd=g({conv3DBackpropFilter_:k1});function I1(r,t,e,o,n){w(r.length===t.rank,()=>`Length of inShape (${r.length}) and rank of dy (${t.rank}) must match`);let s=r,i=t,a=!1;t.rank===4&&(a=!0,i=E(t,[1,t.shape[0],t.shape[1],t.shape[2],t.shape[3]]),s=[1,r[0],r[1],r[2],r[3]]);let u=s[4],p=i.shape[4];w(s.length===5,()=>`Error in conv3dDerInput: inShape must be length 5, but got length ${s.length}.`),w(i.rank===5,()=>`Error in conv3dDerInput: dy must be rank 5, but got rank ${i.rank}`),w(e.rank===5,()=>`Error in conv3dDerInput: filter must be rank 5, but got rank ${e.rank}`),w(u===e.shape[3],()=>`Error in conv3dDerInput: depth of input (${u}) must match input depth for filter ${e.shape[3]}.`),w(p===e.shape[4],()=>`Error in conv3dDerInput: depth of output (${p}) must match output depth for filter ${e.shape[4]}.`);let l={dy:i,filter:e},c={pad:n,strides:o,inputShape:s},m=y.runKernel(Wi,l,c);return a?E(m,[m.shape[1],m.shape[2],m.shape[3],m.shape[4]]):m}var tu=g({conv3DBackpropInput_:I1});var Id={kernelName:rn,inputsToSave:["x","filter"],gradFunc:(r,t,e)=>{let{dilations:o,strides:n,pad:s}=e;w(ge(o),()=>`Error in gradient of conv3D: dilation rates greater than 1 are not yet supported in gradients. Got dilations '${o}'`);let[i,a]=t;return{x:()=>tu(i.shape,r,a,n,s),filter:()=>kd(i,r,a.shape,n,s)}}};function E1(r){let e={x:d(r,"x","sin","float32")};return y.runKernel("Sin",e)}var Zl=g({sin_:E1});var Ed={kernelName:"Cos",inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(lt(Zl(_(e,"float32"))),r)}}};function $1(r){let e={x:d(r,"x","sinh")};return y.runKernel(Un,e)}var Ql=g({sinh_:$1});var $d={kernelName:on,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(Ql(_(e,"float32")),r)}}};function Jl(r,t){for(let e=0;e<r.length;++e)if(r[r.length-e-1]!==t-1-e)return!1;return!0}function Nd(r,t,e){let o=r.length+t.length,n=[],s=0,i=0;for(let a=0;a<o;a++)e.indexOf(a)===-1?n.push(r[s++]):n.push(t[i++]);return n}function tc(r,t){let e=[],o=r.length;for(let s=0;s<o;s++)t.indexOf(s)===-1&&e.push(r[s]);let n=t.map(s=>r[s]);return[e,n]}function Ne(r,t){let e=t.map(o=>1);return Nd(r,e,t)}function N1(r,t,e){w(Jl(t,e),()=>`${r} supports only inner-most axes for now. Got axes ${t} and rank-${e} input.`)}function ec(r,t){if(Jl(r,t))return null;let e=[];for(let o=0;o<t;++o)r.indexOf(o)===-1&&e.push(o);return r.forEach(o=>e.push(o)),e}function ii(r){return r.map((t,e)=>[e,t]).sort((t,e)=>t[1]-e[1]).map(t=>t[0])}function T1(r,t){let e=[];for(let o=t-r;o<t;++o)e.push(o);return e}function D1(r,t=0,e=!1,o=!1){let s={x:d(r,"x","cumsum")},i={axis:t,exclusive:e,reverse:o};return y.runKernel(nn,s,i)}var oc=g({cumsum_:D1});function CG(){L().set("PROD",!0)}function vG(){L().set("DEBUG",!0)}function kG(){L().set("DEPRECATION_WARNINGS_ENABLED",!1),console.warn("TensorFlow.js deprecation warnings have been disabled.")}function A1(r){L().getBool("DEPRECATION_WARNINGS_ENABLED")&&console.warn(r+" You can disable deprecation warnings with tf.disableDeprecationWarnings().")}Vf(A1);function IG(){y.disposeVariables()}function eu(){return y}function EG(){return y.memory()}function $G(r){return y.profile(r)}function dt(r,t){return y.tidy(r,t)}function Ft(r){ei(r).forEach(e=>e.dispose())}function Td(r){return y.keep(r)}function NG(r){return y.time(r)}function TG(r){return y.setBackend(r)}function DG(){return y.ready()}function Dd(){return y.backendName}function AG(r){y.removeBackend(r)}function RG(r){return y.findBackend(r)}function FG(r){return y.findBackendFactory(r)}function Ad(r,t,e=1){return y.registerBackend(r,t,e)}function Rd(){return y.backend}function PG(r,t){L().setPlatform(r,t)}function R1(r,t){let e=d(r,"real","complex"),o=d(t,"imag","complex");yt(e.shape,o.shape,`real and imag shapes, ${e.shape} and ${o.shape}, must match in call to tf.complex().`);let n={real:e,imag:o};return y.runKernel(Bs,n)}var ae=g({complex_:R1});function F1(r){let e={input:d(r,"input","imag")};return y.runKernel(ia,e)}var uo=g({imag_:F1});function P1(r){let e={input:d(r,"input","real")};return y.runKernel(Os,e)}var Ur=g({real_:P1});function M1(r,t,e){let o=d(r,"x","transpose");if(t==null&&(t=o.shape.map((i,a)=>a).reverse()),w(o.rank===t.length,()=>`Error in transpose: rank of input ${o.rank} must match length of perm ${t}.`),t.forEach(i=>{w(i>=0&&i<o.rank,()=>`All entries in 'perm' must be between 0 and ${o.rank-1} but got ${t}`)}),o.rank<=1)return o.clone();let n={x:o},s={perm:t};return o.dtype==="complex64"?dt(()=>{let i=Ur(o),a=uo(o);return i=y.runKernel(Lr,{x:i},s),a=y.runKernel(Lr,{x:a},s),e&&(a=lt(a)),ae(i,a)}):y.runKernel(Lr,n,s)}var te=g({transpose_:M1});var Fd={kernelName:nn,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{axis:n,exclusive:s,reverse:i}=e;return{x:()=>{let a=ec([n],o.rank),u=oc(r,n,s,!i);return a!=null&&(u=te(u,a)),u}}}};function _1(r,t,e,o,n,s=[1,1],i){let a=r;r.rank===3&&(a=E(r,[1,r.shape[0],r.shape[1],r.shape[2]]));let u=t;u.rank===3&&(u=E(t,[1,t.shape[0],t.shape[1],t.shape[2]]));let p={x:a,dy:u},l={strides:o,pad:n,dimRoundingMode:i,dilations:s,filterShape:e};return y.runKernel(Xi,p,l)}var ru=g({depthwiseConv2dNativeBackpropFilter_:_1});function B1(r,t,e,o,n,s=[1,1],i){let a=t,u=!1;t.rank===3&&(u=!0,a=E(t,[1,t.shape[0],t.shape[1],t.shape[2]]));let p={dy:a,filter:e},l={strides:o,pad:n,dimRoundingMode:i,dilations:s,inputShape:r},c=y.runKernel(ji,p,l);return u?E(c,[c.shape[1],c.shape[2],c.shape[3]]):c}var ou=g({depthwiseConv2dNativeBackpropInput_:B1});var Pd={kernelName:sn,inputsToSave:["x","filter"],gradFunc:(r,t,e)=>{let{dilations:o,strides:n,pad:s,dimRoundingMode:i}=e,a=o??[1,1];w(ge(a),()=>`Error in gradient of depthwiseConv2dNative: dilation rates greater than 1 are not yet supported. Got dilations '${a}'`);let[u,p]=t;return w(u.rank===4,()=>`Error in gradient of depthwiseConv2dNative: input must be rank 4, but got rank ${u.rank}.`),w(p.rank===4,()=>`Error in gradient of depthwiseConv2dNative: filter must be rank 4, but got rank ${p.rank}.`),w(u.shape[3]===p.shape[2],()=>`Error in gradient of depthwiseConv2d: number of input channels (${u.shape[3]}) must match the inChannels dimension in filter ${p.shape[2]}.`),w(Bt(n,a),()=>`Error in gradient of depthwiseConv2d: Either strides or dilations must be  1. Got strides ${n} and dilations '${a}'.`),ft("depthwiseConv2d",s,i),{x:()=>ou(u.shape,r,p,n,s,a,i),filter:()=>ru(u,r,p.shape,n,s,a,i)}}};var Md={kernelName:an,inputsToSave:["x","filter"],gradFunc:(r,t,e)=>{let[o,n]=t,s={x:o,filter:n,dy:r},i={x:o,filter:n,dy:r};return{x:()=>y.runKernel(Zi,s,e),filter:()=>y.runKernel(Qi,i,e)}}};var _d={kernelName:"Elu",outputsToSave:[!0],gradFunc:(r,t)=>{let[e]=t,o={dy:r,y:e};return{x:()=>y.runKernel(ta,o)}}};function z1(r){let e={x:d(r,"x","exp")};return y.runKernel("Exp",e)}var zt=g({exp_:z1});var Bd={kernelName:"Erf",inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t,o=$(zt(lt(tt(e))),2/Math.sqrt(Math.PI));return{x:()=>$(r,o)}}};var zd={kernelName:"Exp",outputsToSave:[!0],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(r,e)}}};var Ld={kernelName:cn,inputsToSave:["input"],gradFunc:(r,t)=>{let[e]=t;return{input:()=>E(r,e.shape)}}};var Gd={kernelName:$r,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(r,zt(e))}}};var Od={kernelName:Nr,gradFunc:r=>({x:()=>Z(r)})};var Wd={kernelName:Tr,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=Q(e.shape,o.shape);return{a:()=>{let a=V(r,_(o,"float32")),u=mt(e.shape,n);return u.length>0?E(K(a,u),e.shape):a},b:()=>{let a=$(r,_(e,"float32")),u=mt(o.shape,n);u.length>0&&(a=E(K(a,u),o.shape));let p=tt(o);return lt(V(a,_(p,"float32")))}}}};function L1(r){let e={x:d(r,"x","rsqrt","float32")};return y.runKernel(Pr,e)}var nc=g({rsqrt_:L1});function G1(r,t){let e=d(r,"x","tile","string_or_numeric");w(e.rank===t.length,()=>`Error in transpose: rank of input ${e.rank} must match length of reps ${t}.`);let o={x:e},n={reps:t};return y.runKernel(zr,o,n)}var dr=g({tile_:G1});var Ud={kernelName:mn,inputsToSave:["x","mean","variance","scale"],gradFunc:(r,t,e)=>{let{varianceEpsilon:o}=e,[n,s,i,a]=t,u=a??X(1),p=mt(s.shape,n.shape),l=[];if(s.rank===1){for(let I=0;I<n.shape.length-1;++I)l.push(n.shape[I]);l.push(1)}let c=U(n,s),m=$(r,u),f=nc(O(i,X(o))),h=$($($(f,f),f),X(-.5));return{x:()=>s.rank===1?E($($(r,dr(E(f,[1,1,1,s.shape[0]]),l)),u),n.shape):E($($(r,f),u),n.shape),mean:()=>{let I=$($(f,X(-1)),m);return s.rank===1&&(I=K(I,p)),E(I,s.shape)},variance:()=>{let I=$($(h,c),m);return s.rank===1&&(I=K(I,p)),E(I,s.shape)},scale:()=>{let I=$(c,f),T=$(r,I);return s.rank===1&&(T=K(T,p)),E(T,s.shape)},offset:()=>{let I=r;return s.rank===1&&(I=K(I,p)),E(I,s.shape)}}}};function O1(r,t=0){let e=lr(r,"tensors","stack","string_or_numeric");w(e.length>=1,()=>"Pass at least one tensor to tf.stack"),e.length>0&&w(t<=e[0].rank,()=>"Axis must be <= rank of the tensor");let o=e,n={axis:t};return y.runKernel(Dn,o,n)}var Te=g({stack_:O1});function W1(r,t,e){let o=d(r,"x","unsortedSegmentSum"),n=d(t,"segmentIds","unsortedSegmentSum","int32");w(ur(e),()=>"numSegments must be of dtype int");let s={x:o,segmentIds:n},i={numSegments:e};return y.runKernel(Qn,s,i)}var sc=g({unsortedSegmentSum_:W1});var qd={kernelName:fn,inputsToSave:["x","indices"],gradFunc:(r,t,e)=>{let[o,n]=t,{axis:s,batchDims:i}=e,a=Rt(s,o.shape)[0],u=(p,l,c)=>()=>{let m=p.shape,f=l.size,h=m.slice(0,a),b=h.length,x=m.slice(s,m.length).slice(1),C=x.length,k=Vd(0,b),v=Vd(b+1,b+1+C),I=Hd([h,[f],x]),T=E(c,I),R=E(l,[f]),M=Hd([[b],k,v]),z=te(T,M),B=sc(z,R,p.shape[a]),H=ii(M);return B=te(B,H),B};if(i===1){let p=o.shape[0],l=o.split(p,0);return{x:()=>Te(l.map((f,h)=>u(f,n.slice(h,1),r.slice(h,1))())).reshape(o.shape),indices:()=>n}}else return{x:u(o,n,r),indices:()=>n}}};function Vd(r,t){let e=[];for(let o=r;o<t;++o)e.push(o);return e}function Hd(r){let t=[];for(let e=0;e<r.length;++e)for(let o=0;o<r[e].length;++o)t.push(r[e][o]);return t}var Kd={kernelName:Dr,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t;return{a:()=>Z(e),b:()=>Z(o)}}};var Xd={kernelName:ar,gradFunc:r=>({x:()=>_(r,"float32")})};var jd={kernelName:hn,gradFunc:r=>({x:()=>Z(r)})};var Yd={kernelName:gn,gradFunc:r=>({x:()=>Z(r)})};var Zd={kernelName:xn,gradFunc:r=>({x:()=>Z(r)})};function U1(r,t){let e=d(r,"a","greater","string_or_numeric"),o=d(t,"b","greater","string_or_numeric");[e,o]=ot(e,o),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(dn,n)}var Zt=g({greater_:U1});var Qd={kernelName:yn,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{alpha:n}=e,s=Zt(o,0);return{x:()=>It(s,r,$(r,n))}}};var Jd={kernelName:Cn,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,O(e,1))}}};var th={kernelName:"Log",inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,_(e,"float32"))}}};var eh={kernelName:nf,inputsToSave:[],outputsToSave:[!0],gradFunc:(r,t,e)=>{let[o]=t,{axis:n}=e;return{logits:()=>{let i=zt(o);return U(r,$(K(r,n,!0),i))}}}};function V1(r,t,e,o=5,n=1,s=1,i=.5){let a={x:r,y:t,dy:e},u={depthRadius:o,bias:n,alpha:s,beta:i};return y.runKernel(ma,a,u)}var rh=g({localResponseNormalizationBackprop_:V1});var oh={kernelName:"LRN",inputsToSave:["x"],outputsToSave:[!0],gradFunc:(r,t,e)=>{let[o,n]=t,{depthRadius:s,bias:i,alpha:a,beta:u}=e;return{x:()=>rh(o,n,r,s,i,a,u)}}};function H1(r,t){let e=d(r,"a","equal","string_or_numeric"),o=d(t,"b","equal","string_or_numeric");[e,o]=ot(e,o),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(pn,n)}var ai=g({equal_:H1});function nu(r,t,e,o){return t.rank<e.rank&&(t=E(t,Ne(t.shape,o))),r.rank<e.rank&&(r=E(r,Ne(r.shape,o))),{x:()=>$(r,_(ai(e,t),r.dtype))}}var ic={kernelName:"Max",inputsToSave:["x"],outputsToSave:[!0],gradFunc:(r,t,e)=>{let o=e,{reductionIndices:n}=o,s=t[0],i=t[1],a=Rt(n,s.shape),u=nu(r,i,s,a);return{x:()=>u.x()}}};function q1(r,t){let e=d(r,"a","less","string_or_numeric"),o=d(t,"b","less","string_or_numeric");[e,o]=ot(e,o),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(bn,n)}var hs=g({less_:q1});var nh={kernelName:Ar,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t;return{a:()=>$(r,_(mr(e,o),"float32")),b:()=>$(r,_(hs(e,o),"float32"))}}};function K1(r,t,e,o,n,s,i){let a=d(r,"dy","maxPool3dGrad"),u=d(t,"input","maxPool3dGrad"),p=d(e,"output","maxPool3dGrad"),l=a,c=u,m=p,f=!1;u.rank===4&&(f=!0,l=E(a,[1,a.shape[0],a.shape[1],a.shape[2],a.shape[3]]),c=E(u,[1,u.shape[0],u.shape[1],u.shape[2],u.shape[3]]),m=E(p,[1,p.shape[0],p.shape[1],p.shape[2],p.shape[3]])),w(l.rank===5,()=>`Error in maxPool3dGrad: dy must be rank 5 but got rank ${l.rank}.`),w(c.rank===5,()=>`Error in maxPool3dGrad: input must be rank 5 but got rank ${c.rank}.`),w(m.rank===5,()=>`Error in maxPool3dGrad: output must be rank 5 but got rank ${m.rank}.`),ft("maxPool3dGrad",s,i);let h={dy:l,input:c,output:m},b={filterSize:o,strides:n,pad:s,dimRoundingMode:i},x=y.runKernel(ha,h,b);return f?E(x,[x.shape[1],x.shape[2],x.shape[3],x.shape[4]]):x}var sh=g({maxPool3dGrad_:K1});var ih={kernelName:kn,inputsToSave:["x"],outputsToSave:[!0],gradFunc:(r,t,e)=>{let[o,n]=t,{filterSize:s,strides:i,pad:a,dimRoundingMode:u}=e;return{x:()=>sh(r,o,n,s,i,a,u)}}};function X1(r,t,e,o,n,s,i){let a=d(r,"dy","maxPoolGrad"),u=d(t,"input","maxPoolGrad"),p=d(e,"output","maxPoolGrad");w(u.rank===a.rank,()=>`Rank of input (${u.rank}) does not match rank of dy (${a.rank})`),w(a.rank===4,()=>`Error in maxPoolGrad: dy must be rank 4 but got rank ${a.rank}.`),w(u.rank===4,()=>`Error in maxPoolGrad: input must be rank 4 but got rank ${u.rank}.`),ft("maxPoolGrad",s,i);let l={dy:a,input:u,output:p},c={filterSize:o,strides:n,pad:s,dimRoundingMode:i};return y.runKernel(da,l,c)}var ah=g({maxPoolGrad_:X1});var uh={kernelName:vn,inputsToSave:["x"],outputsToSave:[!0],gradFunc:(r,t,e)=>{let[o,n]=t,{filterSize:s,strides:i,pad:a}=e;return{x:()=>ah(r,o,n,s,i,a)}}};function ye(r,t="float32"){if(wt(r),t==="complex64"){let o=ye(r,"float32"),n=ye(r,"float32");return ae(o,n)}let e=ns(rt(r),t);return y.makeTensor(e,r,t)}function ee(r,t="float32"){if(wt(r),t==="complex64"){let o=ee(r,"float32"),n=ye(r,"float32");return ae(o,n)}let e=Ks(rt(r),t);return y.makeTensor(e,r,t)}var ph={kernelName:In,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{axis:n}=e,s=Rt(n,o.shape),a=tc(o.shape,s)[1],u=rt(a);return{x:()=>{let l=o.shape.slice();s.forEach(f=>{l[f]=1});let c=E(r,l);return V($(c,ee(o.shape,"float32")),u)}}}};var lh={kernelName:"Min",inputsToSave:["x"],outputsToSave:[!0],gradFunc:(r,t,e)=>{let o=e,{axis:n}=o,[s,i]=t,a=Rt(n,s.shape),u=nu(r,i,s,a);return{x:()=>u.x()}}};var ch={kernelName:Rr,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t;return{a:()=>$(r,_(Ge(e,o),"float32")),b:()=>$(r,_(Zt(e,o),"float32"))}}};function j1(r,t,e){let o=d(r,"x","slice","string_or_numeric");if(o.rank===0)throw new Error("Slicing scalar is not possible");let n={x:o},s={begin:t,size:e};return y.runKernel(Yr,n,s)}var at=g({slice_:j1});var mh={kernelName:En,inputsToSave:["x"],gradFunc:(r,t,e)=>{let o=t[0],{paddings:n}=e,s=n.map(i=>i[0]);return{x:()=>at(r,s,o.shape)}}};function Y1(r){let e={x:d(r,"x","floor","float32")};return y.runKernel(Nr,e)}var ui=g({floor_:Y1});var fh={kernelName:"Mod",inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=Q(e.shape,o.shape);return{a:()=>{let a=mt(e.shape,n);return a.length>0?E(K(r,a),e.shape):r},b:()=>{let a=$(r,lt(ui(V(e,o)))),u=mt(o.shape,n);return u.length>0?E(K(a,u),o.shape):a}}}};var dh={kernelName:Fr,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=Q(e.shape,o.shape);return{a:()=>{let a=$(r,_(o,"float32")),u=mt(e.shape,n);return u.length>0?E(K(a,u),e.shape):a},b:()=>{let a=$(r,_(e,"float32")),u=mt(o.shape,n);return u.length>0?E(K(a,u),o.shape):a}}}};var hh={kernelName:"Neg",gradFunc:r=>({x:()=>lt(r)})};var gh={kernelName:Tn,inputsToSave:["indices"],gradFunc:(r,t)=>{let e=t[0];return{indices:()=>ye(e.shape,"float32")}}};var xh={kernelName:Nn,gradFunc:r=>({x:()=>Z(r)})};function Z1(r,t=0){let e=d(r,"x","unstack","string_or_numeric");w(t>=-e.shape.length&&t<e.shape.length,()=>`Axis = ${t} is not in [-${e.shape.length}, ${e.shape.length})`);let o={value:e},n={axis:t};return y.runKernel(Zn,o,n)}var po=g({unstack_:Z1});var yh={kernelName:Dn,saveAllInputs:!0,gradFunc:(r,t,e)=>{let{axis:o}=e;return po(r,o).map(s=>()=>s)}};var ac={kernelName:An,inputsToSave:["x"],gradFunc:(r,t,e)=>{let o=t[0],{paddings:n}=e,s=n.map(i=>i[0]);return{x:()=>at(r,s,o.shape)}}};function Q1(r){let e={x:d(r,"x","log","float32")};return y.runKernel("Log",e)}var Je=g({log_:Q1});function J1(r,t){let e=d(r,"base","pow"),o=d(t,"exp","pow");[e,o]=ot(e,o);let n={a:e,b:o};return y.runKernel("Pow",n)}var De=g({pow_:J1});var bh={kernelName:"Pow",inputsToSave:["a","b"],outputsToSave:[!0],gradFunc:(r,t)=>{let[e,o,n]=t,s=e,i=o,a=Q(s.shape,i.shape);return{a:()=>{let l=_(i,"float32"),c=$(r,$(l,De(s,U(l,X(1))))),m=mt(s.shape,a);return m.length>0&&(c=K(c,m)),E(c,s.shape)},b:()=>{let l=Zt(s,0),c=It(l,Je(s),Z(s)),m=$(r,$(n,c)),f=mt(i.shape,a);return f.length>0&&(m=K(m,f)),E(m,i.shape)}}}};var wh={kernelName:Rn,inputsToSave:["x","alpha"],gradFunc:(r,t)=>{let[e,o]=t,n=Zt(e,0);return{x:()=>It(n,r,$(r,o)),alpha:()=>{let s=It(n,Z(r),$(r,e)),i=mt(o.shape,r.shape);return i.length>0&&(s=K(s,i)),E(s,o.shape)}}}};var Jh={};Ht(Jh,{CompositeArrayBuffer:()=>Gt,browserFiles:()=>Gh,browserHTTPRequest:()=>Vh,concatenateArrayBuffers:()=>Nh,copyModel:()=>Zh,decodeWeights:()=>su,decodeWeightsStream:()=>Ih,encodeWeights:()=>vh,fromMemory:()=>Hh,fromMemorySync:()=>Cc,getLoadHandlers:()=>Rh,getModelArtifactsForJSON:()=>gs,getModelArtifactsForJSONSync:()=>fc,getModelArtifactsInfoForJSON:()=>tr,getSaveHandlers:()=>Ah,getWeightSpecs:()=>pi,http:()=>lu,isHTTPScheme:()=>pu,listModels:()=>jh,loadWeights:()=>Wh,moveModel:()=>Qh,registerLoadRouter:()=>Dh,registerSaveRouter:()=>Th,removeModel:()=>Yh,weightsLoaderFactory:()=>wc,withSaveHandler:()=>qh,withSaveHandlerSync:()=>Kh});var lc={};Ht(lc,{isBrowser:()=>pc,isMobile:()=>rC,mockIsMobile:()=>eC});function tC(){return typeof navigator<"u"&&navigator!=null}var uc;function eC(r){uc=r}function rC(r){if(uc!==void 0)return uc;if(r||tC()){if(r||(r=navigator),r.product==="ReactNative")return!0;let t=r.userAgent||r.vendor||(typeof window<"u"?window.opera:"");if(!t){let e=r;return e.userAgentData&&e.userAgentData.mobile}return/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(t)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(t.substr(0,4))}return!1}function pc(){return typeof window<"u"&&window.document!=null||typeof WorkerGlobalScope<"u"}var re=L();re.registerFlag("DEBUG",()=>!1,r=>{r&&console.warn("Debugging mode is ON. The output of every math call will be downloaded to CPU and checked for NaNs. This significantly impacts performance.")});re.registerFlag("IS_BROWSER",()=>pc());re.registerFlag("IS_NODE",()=>typeof process<"u"&&typeof process.versions<"u"&&typeof process.versions.node<"u");re.registerFlag("IS_CHROME",()=>typeof navigator<"u"&&navigator!=null&&navigator.userAgent!=null&&/Chrome/.test(navigator.userAgent)&&/Google Inc/.test(navigator.vendor));re.registerFlag("IS_SAFARI",()=>typeof navigator<"u"&&navigator!=null&&navigator.userAgent!=null&&/Safari/.test(navigator.userAgent)&&/Apple/.test(navigator.vendor));re.registerFlag("PROD",()=>!1);re.registerFlag("TENSORLIKE_CHECK_SHAPE_CONSISTENCY",()=>re.getBool("DEBUG"));re.registerFlag("DEPRECATION_WARNINGS_ENABLED",()=>!0);re.registerFlag("IS_TEST",()=>!1);re.registerFlag("CHECK_COMPUTATION_FOR_ERRORS",()=>re.getBool("DEBUG"));re.registerFlag("WRAP_TO_IMAGEBITMAP",()=>!1);re.registerFlag("CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU",()=>!1);re.registerFlag("USE_SETTIMEOUTCUSTOM",()=>!1);function hr(r,t,e){let o=Lt(r,e);return Yt(r,t,o,e)}var gr={float32:4,float16:2,int32:4,uint16:2,uint8:1,bool:1,complex64:8};var Gt=class r{static join(t){return new r(t).slice()}constructor(t){if(this.shards=[],this.previousShardIndex=0,t==null||(t instanceof Array||(t=[t]),t=t.map(o=>Dt(o)?o.buffer:o),t.length===0))return;this.bufferUniformSize=t[0].byteLength;let e=0;for(let o=0;o<t.length;o++){let n=t[o];o!==t.length-1&&n.byteLength!==this.bufferUniformSize&&(this.bufferUniformSize=void 0);let s=e+n.byteLength;this.shards.push({buffer:n,start:e,end:s}),e=s}this.shards.length===0&&(this.byteLength=0),this.byteLength=this.shards[this.shards.length-1].end}slice(t=0,e=this.byteLength){if(this.shards.length===0)return new ArrayBuffer(0);if(t=isNaN(Number(t))?0:t,e=isNaN(Number(e))?0:e,t=Math.max(0,t),e=Math.min(this.byteLength,e),e<=t)return new ArrayBuffer(0);let o=this.findShardForByte(t);if(o===-1)throw new Error(`Could not find start shard for byte ${t}`);let n=e-t,s=new ArrayBuffer(n),i=new Uint8Array(s),a=0;for(let u=o;u<this.shards.length;u++){let p=this.shards[u],c=t+a-p.start,m=a,h=Math.min(e,p.end)-p.start,b=new Uint8Array(p.buffer,c,h-c);if(i.set(b,m),a+=b.length,e<p.end)break}return s}findShardForByte(t){if(this.shards.length===0||t<0||t>=this.byteLength)return-1;if(this.bufferUniformSize!=null)return this.previousShardIndex=Math.floor(t/this.bufferUniformSize),this.previousShardIndex;function e(n){return t<n.start?-1:t>=n.end?1:0}if(e(this.shards[this.previousShardIndex])===0)return this.previousShardIndex;let o=oC(this.shards,e);return o===-1?-1:(this.previousShardIndex=o,this.previousShardIndex)}};function oC(r,t){let e=0,o=r.length;for(;e<=o;){let n=Math.floor((o-e)/2)+e,s=t(r[n]);if(s===0)return n;s<0?o=n:e=n+1}return-1}var Vr=4;async function vh(r,t){let e=[],o=[],n=Array.isArray(r)?r.map(i=>i.name):Object.keys(r);for(let i=0;i<n.length;++i){let a=n[i],u=Array.isArray(r)?r[i].tensor:r[a];if(u.dtype!=="float32"&&u.dtype!=="int32"&&u.dtype!=="bool"&&u.dtype!=="string"&&u.dtype!=="complex64")throw new Error(`Unsupported dtype in weight '${a}': ${u.dtype}`);let p={name:a,shape:u.shape,dtype:u.dtype};if(u.dtype==="string"){let l=new Promise(async c=>{let m=await u.bytes(),f=m.reduce((x,C)=>x+C.length,0)+Vr*m.length,h=new Uint8Array(f),b=0;for(let x=0;x<m.length;x++){let C=m[x],k=new Uint8Array(new Uint32Array([C.length]).buffer);h.set(k,b),b+=Vr,h.set(C,b),b+=C.length}c(h)});o.push(l)}else o.push(u.data());t!=null&&(p.group=t),e.push(p)}let s=await Promise.all(o);return{data:iC(s),specs:e}}function su(r,t){let e=new Gt(r),o={},n=0;for(let s of t){let i=nC(s,(a,u)=>e.slice(n+a,n+u));o[s.name]=kh(s,e.slice(n,n+i)),n+=i}return o}function nC(r,t){let e=rt(r.shape),o;if("quantization"in r){let n=r.quantization;o=gr[n.dtype]}else if(r.dtype==="string"){let n=0;for(let s=0;s<e;s++)n+=Vr+new Uint32Array(t(n,n+Vr))[0];return n}else o=gr[r.dtype];return e*o}async function sC(r,t){let e=rt(r.shape),o;if("quantization"in r){let n=r.quantization;o=gr[n.dtype]}else if(r.dtype==="string"){let n=0;for(let s=0;s<e;s++)n+=Vr+new Uint32Array(await t(n,n+Vr))[0];return n}else o=gr[r.dtype];return e*o}function kh(r,t){let e=r.name,o=r.dtype,n=r.shape,s=rt(n),i,a=0;if("quantization"in r){let u=r.quantization;if(u.dtype==="uint8"||u.dtype==="uint16"){if(!("min"in u&&"scale"in u))throw new Error(`Weight ${r.name} with quantization ${u.dtype} doesn't have corresponding metadata min and scale.`)}else if(u.dtype==="float16"){if(o!=="float32")throw new Error(`Weight ${r.name} is quantized with ${u.dtype} which only supports weights of type float32 not ${o}.`)}else throw new Error(`Weight ${r.name} has unknown quantization dtype ${u.dtype}. Supported quantization dtypes are: 'uint8', 'uint16', and 'float16'.`);let p=gr[u.dtype],l=u.dtype==="uint8"?new Uint8Array(t):new Uint16Array(t);if(o==="float32")if(u.dtype==="uint8"||u.dtype==="uint16"){i=new Float32Array(l.length);for(let c=0;c<l.length;c++){let m=l[c];i[c]=m*u.scale+u.min}}else if(u.dtype==="float16")i=lC()(l);else throw new Error(`Unsupported quantization type ${u.dtype} for weight type float32.`);else if(o==="int32"){if(u.dtype!=="uint8"&&u.dtype!=="uint16")throw new Error(`Unsupported quantization type ${u.dtype} for weight type int32.`);i=new Int32Array(l.length);for(let c=0;c<l.length;c++){let m=l[c];i[c]=Math.round(m*u.scale+u.min)}}else throw new Error(`Unsupported dtype in weight '${e}': ${o}`);a+=s*p}else if(o==="string"){let u=rt(r.shape);i=[];for(let p=0;p<u;p++){let l=new Uint32Array(t.slice(a,a+Vr))[0];a+=Vr;let c=new Uint8Array(t.slice(a,a+l));i.push(c),a+=l}}else{let u=gr[o];if(o==="float32")i=new Float32Array(t);else if(o==="int32")i=new Int32Array(t);else if(o==="bool")i=new Uint8Array(t);else if(o==="complex64"){i=new Float32Array(t);let p=new Float32Array(i.length/2),l=new Float32Array(i.length/2);for(let h=0;h<p.length;h++)p[h]=i[h*2],l[h]=i[h*2+1];let c=hr(p,n,"float32"),m=hr(l,n,"float32"),f=ae(c,m);return c.dispose(),m.dispose(),f}else throw new Error(`Unsupported dtype in weight '${e}': ${o}`);a+=s*u}return hr(i,n,o)}async function Sh(r,t,e){let o=new Uint8Array(t);for(;o.byteLength<e;){let{done:n,value:s}=await r.read();if(n&&s==null){let a=e-o.byteLength;throw new Error(`Reader is done but ${a} bytes are still expected`)}let i=new Uint8Array(o.length+s.byteLength);i.set(o,0),i.set(new Uint8Array(s),o.length),o=i}return o.buffer}async function Ih(r,t){let e={},o=r.getReader(),n=new ArrayBuffer(0);for(let s of t){let i=await sC(s,async(p,l)=>(n=await Sh(o,n,l),n.slice(p,l)));n=await Sh(o,n,i);let a=n.slice(0,i);n=n.slice(i);let u=kh(s,a);if(e[s.name]=u,Dd()==="webgpu"){let p=Rd();"uploadToGPU"in p&&rt(u.shape)>=L().get("WEBGPU_CPU_HANDOFF_SIZE_THRESHOLD")&&p.uploadToGPU(u.dataId)}}return e}function iC(r){if(r===null)throw new Error(`Invalid input value: ${JSON.stringify(r)}`);let t=0,e=[];r.forEach(s=>{if(t+=s.byteLength,e.push(s.byteLength===s.buffer.byteLength?s:new s.constructor(s)),!(s instanceof Float32Array||s instanceof Int32Array||s instanceof Uint8Array))throw new Error(`Unsupported TypedArray subtype: ${s.constructor.name}`)});let o=new Uint8Array(t),n=0;return e.forEach(s=>{o.set(new Uint8Array(s.buffer),n),n+=s.byteLength}),o.buffer}var cc=typeof Buffer<"u"&&(typeof Blob>"u"||typeof atob>"u"||typeof btoa>"u");function Ch(r){return cc?Buffer.byteLength(r,"utf8"):new Blob([r]).size}function Eh(r){if(cc)return Buffer.from(r).toString("base64");let t=new Uint8Array(r),e="";for(let o=0,n=t.length;o<n;o++)e+=String.fromCharCode(t[o]);return btoa(e)}function $h(r){if(cc){let o=Buffer.from(r,"base64");return o.buffer.slice(o.byteOffset,o.byteOffset+o.byteLength)}let t=atob(r),e=new Uint8Array(t.length);for(let o=0;o<t.length;++o)e.set([t.charCodeAt(o)],o);return e.buffer}function Nh(r){return Gt.join(r)}function mc(r){for(r=r.trim();r.endsWith("/");)r=r.slice(0,r.length-1);let e=r.split("/");return e[e.length-1]}function iu(r,t){let e={modelTopology:r.modelTopology,format:r.format,generatedBy:r.generatedBy,convertedBy:r.convertedBy,weightsManifest:t};return r.signature!=null&&(e.signature=r.signature),r.userDefinedMetadata!=null&&(e.userDefinedMetadata=r.userDefinedMetadata),r.modelInitializer!=null&&(e.modelInitializer=r.modelInitializer),r.initializerSignature!=null&&(e.initializerSignature=r.initializerSignature),r.trainingConfig!=null&&(e.trainingConfig=r.trainingConfig),e}function fc(r,t,e){let o={modelTopology:r.modelTopology,format:r.format,generatedBy:r.generatedBy,convertedBy:r.convertedBy};if(r.trainingConfig!=null&&(o.trainingConfig=r.trainingConfig),r.weightsManifest!=null){if(!t)throw new Error("modelJSON has weightsManifest but weightSpecs is null");if(!e)throw new Error("modelJSON has weightsManifest but weightData is null");o.weightSpecs=t,o.weightData=e}return r.signature!=null&&(o.signature=r.signature),r.userDefinedMetadata!=null&&(o.userDefinedMetadata=r.userDefinedMetadata),r.modelInitializer!=null&&(o.modelInitializer=r.modelInitializer),r.initializerSignature!=null&&(o.initializerSignature=r.initializerSignature),o}async function gs(r,t){let e,o;return r.weightsManifest!=null&&([e,o]=await t(r.weightsManifest)),fc(r,e,o)}function tr(r){if(r.modelTopology instanceof ArrayBuffer)throw new Error("Expected JSON model topology, received ArrayBuffer.");return{dateSaved:new Date,modelTopologyType:"JSON",modelTopologyBytes:r.modelTopology==null?0:Ch(JSON.stringify(r.modelTopology)),weightSpecsBytes:r.weightSpecs==null?0:Ch(JSON.stringify(r.weightSpecs)),weightDataBytes:r.weightData==null?0:new Gt(r.weightData).byteLength}}function pi(r){let t=[];for(let e of r)t.push(...e.weights);return t}function aC(){let r=e=>{let o=e<<13,n=0;for(;(o&8388608)===0;)n-=8388608,o<<=1;return o&=-8388609,n+=947912704,o|n},t=new Uint32Array(2048);t[0]=0;for(let e=1;e<1024;e++)t[e]=r(e);for(let e=1024;e<2048;e++)t[e]=939524096+(e-1024<<13);return t}function uC(){let r=new Uint32Array(64);r[0]=0,r[31]=1199570944,r[32]=2147483648,r[63]=3347054592;for(let t=1;t<31;t++)r[t]=t<<23;for(let t=33;t<63;t++)r[t]=2147483648+(t-32<<23);return r}function pC(){let r=new Uint32Array(64);for(let t=0;t<64;t++)r[t]=1024;return r[0]=r[32]=0,r}function lC(){let r=aC(),t=uC(),e=pC();return o=>{let n=new ArrayBuffer(4*o.length),s=new Uint32Array(n);for(let i=0;i<o.length;i++){let a=o[i],u=r[e[a>>10]+(a&1023)]+t[a>>10];s[i]=u}return new Float32Array(n)}}var Pt=class r{constructor(){this.saveRouters=[],this.loadRouters=[]}static getInstance(){return r.instance==null&&(r.instance=new r),r.instance}static registerSaveRouter(t){r.getInstance().saveRouters.push(t)}static registerLoadRouter(t){r.getInstance().loadRouters.push(t)}static getSaveHandlers(t){return r.getHandlers(t,"save")}static getLoadHandlers(t,e){return r.getHandlers(t,"load",e)}static getHandlers(t,e,o){let n=[];return(e==="load"?r.getInstance().loadRouters:r.getInstance().saveRouters).forEach(i=>{let a=i(t,o);a!==null&&n.push(a)}),n}},Th=r=>Pt.registerSaveRouter(r),Dh=r=>Pt.registerLoadRouter(r),Ah=r=>Pt.getSaveHandlers(r),Rh=(r,t)=>Pt.getLoadHandlers(r,t);var dc="tensorflowjs",hc=1,lo="models_store",Hr="model_info_store";function Fh(){if(!L().getBool("IS_BROWSER"))throw new Error("Failed to obtain IndexedDB factory because the current environmentis not a web browser.");let r=typeof window>"u"?self:window,t=r.indexedDB||r.mozIndexedDB||r.webkitIndexedDB||r.msIndexedDB||r.shimIndexedDB;if(t==null)throw new Error("The current browser does not appear to support IndexedDB.");return t}function gc(r){let t=r.result;t.createObjectStore(lo,{keyPath:"modelPath"}),t.createObjectStore(Hr,{keyPath:"modelPath"})}var er=class{constructor(t){if(this.indexedDB=Fh(),t==null||!t)throw new Error("For IndexedDB, modelPath must not be null, undefined or empty.");this.modelPath=t}async save(t){if(t.modelTopology instanceof ArrayBuffer)throw new Error("BrowserLocalStorage.save() does not support saving model topology in binary formats yet.");return this.databaseAction(this.modelPath,t)}async load(){return this.databaseAction(this.modelPath)}databaseAction(t,e){return new Promise((o,n)=>{let s=this.indexedDB.open(dc,hc);s.onupgradeneeded=()=>gc(s),s.onsuccess=()=>{let i=s.result;if(e==null){let a=i.transaction(lo,"readonly"),p=a.objectStore(lo).get(this.modelPath);p.onsuccess=()=>{if(p.result==null)return i.close(),n(new Error(`Cannot find model with path '${this.modelPath}' in IndexedDB.`));o(p.result.modelArtifacts)},p.onerror=l=>(i.close(),n(p.error)),a.oncomplete=()=>i.close()}else{e.weightData=Gt.join(e.weightData);let a=tr(e),u=i.transaction(Hr,"readwrite"),p=u.objectStore(Hr),l;try{l=p.put({modelPath:this.modelPath,modelArtifactsInfo:a})}catch(m){return n(m)}let c;l.onsuccess=()=>{c=i.transaction(lo,"readwrite");let m=c.objectStore(lo),f;try{f=m.put({modelPath:this.modelPath,modelArtifacts:e,modelArtifactsInfo:a})}catch(h){return n(h)}f.onsuccess=()=>o({modelArtifactsInfo:a}),f.onerror=h=>{p=u.objectStore(Hr);let b=p.delete(this.modelPath);b.onsuccess=()=>(i.close(),n(f.error)),b.onerror=x=>(i.close(),n(f.error))}},l.onerror=m=>(i.close(),n(l.error)),u.oncomplete=()=>{c==null?i.close():c.oncomplete=()=>i.close()}}},s.onerror=i=>n(s.error)})}};er.URL_SCHEME="indexeddb://";var Ph=r=>L().getBool("IS_BROWSER")&&!Array.isArray(r)&&r.startsWith(er.URL_SCHEME)?cC(r.slice(er.URL_SCHEME.length)):null;Pt.registerSaveRouter(Ph);Pt.registerLoadRouter(Ph);function cC(r){return new er(r)}function mC(r){return r.startsWith(er.URL_SCHEME)?r.slice(er.URL_SCHEME.length):r}var au=class{constructor(){this.indexedDB=Fh()}async listModels(){return new Promise((t,e)=>{let o=this.indexedDB.open(dc,hc);o.onupgradeneeded=()=>gc(o),o.onsuccess=()=>{let n=o.result,s=n.transaction(Hr,"readonly"),a=s.objectStore(Hr).getAll();a.onsuccess=()=>{let u={};for(let p of a.result)u[p.modelPath]=p.modelArtifactsInfo;t(u)},a.onerror=u=>(n.close(),e(a.error)),s.oncomplete=()=>n.close()},o.onerror=n=>e(o.error)})}async removeModel(t){return t=mC(t),new Promise((e,o)=>{let n=this.indexedDB.open(dc,hc);n.onupgradeneeded=()=>gc(n),n.onsuccess=()=>{let s=n.result,i=s.transaction(Hr,"readwrite"),a=i.objectStore(Hr),u=a.get(t),p;u.onsuccess=()=>{if(u.result==null)return s.close(),o(new Error(`Cannot find model with path '${t}' in IndexedDB.`));{let l=a.delete(t),c=()=>{p=s.transaction(lo,"readwrite");let f=p.objectStore(lo).delete(t);f.onsuccess=()=>e(u.result.modelArtifactsInfo),f.onerror=h=>o(u.error)};l.onsuccess=c,l.onerror=m=>(c(),s.close(),o(u.error))}},u.onerror=l=>(s.close(),o(u.error)),i.oncomplete=()=>{p==null?s.close():p.oncomplete=()=>s.close()}},n.onerror=s=>o(n.error)})}};var xr="/",xs="tensorflowjs_models",Mh="info",fC="model_topology",dC="weight_specs",hC="weight_data",gC="model_metadata";function _h(r){return{info:[xs,r,Mh].join(xr),topology:[xs,r,fC].join(xr),weightSpecs:[xs,r,dC].join(xr),weightData:[xs,r,hC].join(xr),modelMetadata:[xs,r,gC].join(xr)}}function Bh(r){for(let t of Object.values(r))window.localStorage.removeItem(t)}function xC(r){let t=r.split(xr);if(t.length<3)throw new Error(`Invalid key format: ${r}`);return t.slice(1,t.length-1).join(xr)}function yC(r){return r.startsWith(rr.URL_SCHEME)?r.slice(rr.URL_SCHEME.length):r}var rr=class{constructor(t){if(!L().getBool("IS_BROWSER")||typeof window>"u"||typeof window.localStorage>"u")throw new Error("The current environment does not support local storage.");if(this.LS=window.localStorage,t==null||!t)throw new Error("For local storage, modelPath must not be null, undefined or empty.");this.modelPath=t,this.keys=_h(this.modelPath)}async save(t){if(t.modelTopology instanceof ArrayBuffer)throw new Error("BrowserLocalStorage.save() does not support saving model topology in binary formats yet.");{let e=JSON.stringify(t.modelTopology),o=JSON.stringify(t.weightSpecs),n=tr(t),s=Gt.join(t.weightData);try{this.LS.setItem(this.keys.info,JSON.stringify(n)),this.LS.setItem(this.keys.topology,e),this.LS.setItem(this.keys.weightSpecs,o),this.LS.setItem(this.keys.weightData,Eh(s));let i={format:t.format,generatedBy:t.generatedBy,convertedBy:t.convertedBy,signature:t.signature!=null?t.signature:void 0,userDefinedMetadata:t.userDefinedMetadata!=null?t.userDefinedMetadata:void 0,modelInitializer:t.modelInitializer!=null?t.modelInitializer:void 0,initializerSignature:t.initializerSignature!=null?t.initializerSignature:void 0,trainingConfig:t.trainingConfig!=null?t.trainingConfig:void 0};return this.LS.setItem(this.keys.modelMetadata,JSON.stringify(i)),{modelArtifactsInfo:n}}catch{throw Bh(this.keys),new Error(`Failed to save model '${this.modelPath}' to local storage: size quota being exceeded is a possible cause of this failure: modelTopologyBytes=${n.modelTopologyBytes}, weightSpecsBytes=${n.weightSpecsBytes}, weightDataBytes=${n.weightDataBytes}.`)}}}async load(){let t=JSON.parse(this.LS.getItem(this.keys.info));if(t==null)throw new Error(`In local storage, there is no model with name '${this.modelPath}'`);if(t.modelTopologyType!=="JSON")throw new Error("BrowserLocalStorage does not support loading non-JSON model topology yet.");let e={},o=JSON.parse(this.LS.getItem(this.keys.topology));if(o==null)throw new Error(`In local storage, the topology of model '${this.modelPath}' is missing.`);e.modelTopology=o;let n=JSON.parse(this.LS.getItem(this.keys.weightSpecs));if(n==null)throw new Error(`In local storage, the weight specs of model '${this.modelPath}' are missing.`);e.weightSpecs=n;let s=this.LS.getItem(this.keys.modelMetadata);if(s!=null){let a=JSON.parse(s);e.format=a.format,e.generatedBy=a.generatedBy,e.convertedBy=a.convertedBy,a.signature!=null&&(e.signature=a.signature),a.userDefinedMetadata!=null&&(e.userDefinedMetadata=a.userDefinedMetadata),a.modelInitializer!=null&&(e.modelInitializer=a.modelInitializer),a.initializerSignature!=null&&(e.initializerSignature=a.initializerSignature),a.trainingConfig!=null&&(e.trainingConfig=a.trainingConfig)}let i=this.LS.getItem(this.keys.weightData);if(i==null)throw new Error(`In local storage, the binary weight values of model '${this.modelPath}' are missing.`);return e.weightData=$h(i),e}};rr.URL_SCHEME="localstorage://";var zh=r=>L().getBool("IS_BROWSER")&&!Array.isArray(r)&&r.startsWith(rr.URL_SCHEME)?bC(r.slice(rr.URL_SCHEME.length)):null;Pt.registerSaveRouter(zh);Pt.registerLoadRouter(zh);function bC(r){return new rr(r)}var uu=class{constructor(){w(L().getBool("IS_BROWSER"),()=>"Current environment is not a web browser"),w(typeof window>"u"||typeof window.localStorage<"u",()=>"Current browser does not appear to support localStorage"),this.LS=window.localStorage}async listModels(){let t={},e=xs+xr,o=xr+Mh;for(let n=0;n<this.LS.length;++n){let s=this.LS.key(n);if(s.startsWith(e)&&s.endsWith(o)){let i=xC(s);t[i]=JSON.parse(this.LS.getItem(s))}}return t}async removeModel(t){t=yC(t);let e=_h(t);if(this.LS.getItem(e.info)==null)throw new Error(`Cannot find model at path '${t}'`);let o=JSON.parse(this.LS.getItem(e.info));return Bh(e),o}};var wC="model",SC=".json",CC=".weights.bin";function Lh(r){return new Promise(t=>setTimeout(t)).then(r)}var ys=class r{constructor(t){if(!L().getBool("IS_BROWSER"))throw new Error("browserDownloads() cannot proceed because the current environment is not a browser.");t.startsWith(r.URL_SCHEME)&&(t=t.slice(r.URL_SCHEME.length)),(t==null||t.length===0)&&(t=wC),this.modelJsonFileName=t+SC,this.weightDataFileName=t+CC}async save(t){if(typeof document>"u")throw new Error("Browser downloads are not supported in this environment since `document` is not present");let e=Gt.join(t.weightData),o=window.URL.createObjectURL(new Blob([e],{type:"application/octet-stream"}));if(t.modelTopology instanceof ArrayBuffer)throw new Error("BrowserDownloads.save() does not support saving model topology in binary formats yet.");{let n=[{paths:["./"+this.weightDataFileName],weights:t.weightSpecs}],s=iu(t,n),i=window.URL.createObjectURL(new Blob([JSON.stringify(s)],{type:"application/json"})),a=this.modelJsonAnchor==null?document.createElement("a"):this.modelJsonAnchor;if(a.download=this.modelJsonFileName,a.href=i,await Lh(()=>a.dispatchEvent(new MouseEvent("click"))),t.weightData!=null){let u=this.weightDataAnchor==null?document.createElement("a"):this.weightDataAnchor;u.download=this.weightDataFileName,u.href=o,await Lh(()=>u.dispatchEvent(new MouseEvent("click")))}return{modelArtifactsInfo:tr(t)}}}};ys.URL_SCHEME="downloads://";var xc=class{constructor(t){if(t==null||t.length<1)throw new Error(`When calling browserFiles, at least 1 file is required, but received ${t}`);this.jsonFile=t[0],this.weightsFiles=t.slice(1)}async load(){return new Promise((t,e)=>{let o=new FileReader;o.onload=n=>{let s=JSON.parse(n.target.result),i=s.modelTopology;if(i==null){e(new Error(`modelTopology field is missing from file ${this.jsonFile.name}`));return}if(s.weightsManifest==null){e(new Error(`weightManifest field is missing from file ${this.jsonFile.name}`));return}if(this.weightsFiles.length===0){t({modelTopology:i});return}let u=gs(s,p=>this.loadWeights(p));t(u)},o.onerror=n=>e(`Failed to read model topology and weights manifest JSON from file '${this.jsonFile.name}'. BrowserFiles supports loading Keras-style tf.Model artifacts only.`),o.readAsText(this.jsonFile)})}loadWeights(t){let e=[],o=[];for(let i of t)e.push(...i.weights),o.push(...i.paths);let n=this.checkManifestAndWeightFiles(t),s=o.map(i=>this.loadWeightsFile(i,n[i]));return Promise.all(s).then(i=>[e,i])}loadWeightsFile(t,e){return new Promise((o,n)=>{let s=new FileReader;s.onload=i=>{let a=i.target.result;o(a)},s.onerror=i=>n(`Failed to weights data from file of path '${t}'.`),s.readAsArrayBuffer(e)})}checkManifestAndWeightFiles(t){let e=[],o=this.weightsFiles.map(s=>mc(s.name)),n={};for(let s of t)s.paths.forEach(i=>{let a=mc(i);if(e.indexOf(a)!==-1)throw new Error(`Duplicate file basename found in weights manifest: '${a}'`);if(e.push(a),o.indexOf(a)===-1)throw new Error(`Weight file with basename '${a}' is not provided.`);n[i]=this.weightsFiles[o.indexOf(a)]});if(e.length!==this.weightsFiles.length)throw new Error(`Mismatch in the number of files in weights manifest (${e.length}) and the number of weight files provided (${this.weightsFiles.length}).`);return n}},vC=r=>L().getBool("IS_BROWSER")&&!Array.isArray(r)&&r.startsWith(ys.URL_SCHEME)?kC(r.slice(ys.URL_SCHEME.length)):null;Pt.registerSaveRouter(vC);function kC(r="model"){return new ys(r)}function Gh(r){return new xc(r)}function yc(r,t,e,o){i(r),e=e??0,o=o??1,a(e,o);let n=0,s=u=>(u.then(p=>{let l=e+ ++n/r.length*(o-e);return t(l),p}),u);function i(u){w(u!=null&&Array.isArray(u)&&u.length>0,()=>"promises must be a none empty array")}function a(u,p){w(u>=0&&u<=1,()=>`Progress fraction must be in range [0, 1], but got startFraction ${u}`),w(p>=0&&p<=1,()=>`Progress fraction must be in range [0, 1], but got endFraction ${p}`),w(p>=u,()=>`startFraction must be no more than endFraction, but got startFraction ${u} and endFraction ${p}`)}return Promise.all(r.map(s))}async function bc(r,t){t==null&&(t={});let e=t.fetchFunc==null?L().platform.fetch:t.fetchFunc,o=r.map(c=>e(c,t.requestInit,{isBinary:!0})),a=(t.onProgress==null?await Promise.all(o):await yc(o,t.onProgress,0,.5)).map(c=>c.arrayBuffer());return t.onProgress==null?await Promise.all(a):await yc(a,t.onProgress,.5,1)}function Oh(r,t){var e;let o=t.fetchFunc==null?L().platform.fetch:t.fetchFunc,n=0,s;return(e=t.onProgress)===null||e===void 0||e.call(t,0),new ReadableStream({pull:async i=>{for(var a;n<r.length;){s||(s=(await o(r[n],t.requestInit,{isBinary:!0})).body.getReader());let{done:u,value:p}=await s.read();if(u){n++,s=void 0,(a=t.onProgress)===null||a===void 0||a.call(t,n/r.length);continue}i.enqueue(p);return}i.close()}})}async function Wh(r,t="",e,o){return wc(i=>bc(i,{requestInit:o}))(r,t,e)}function wc(r){return async(t,e="",o)=>{let n=t.map(()=>!1),s={},i=o!=null?o.map(()=>!1):[],a=[];if(t.forEach((f,h)=>{let b=0;f.weights.forEach(x=>{let C="quantization"in x?x.quantization.dtype:x.dtype,k=gr[C]*rt(x.shape),v=()=>{n[h]=!0,s[h]==null&&(s[h]=[]),s[h].push({manifestEntry:x,groupOffset:b,sizeBytes:k})};o!=null?o.forEach((I,T)=>{I===x.name&&(v(),i[T]=!0)}):v(),a.push(x.name),b+=k})}),!i.every(f=>f)){let f=o.filter((h,b)=>!i[b]);throw new Error(`Could not find weights in manifest with names: ${f.join(", ")}. 
Manifest JSON has weights with names: ${a.join(", ")}.`)}let u=n.reduce((f,h,b)=>(h&&f.push(b),f),[]),p=[];u.forEach(f=>{t[f].paths.forEach(h=>{let b=e+(e.endsWith("/")?"":"/")+h;p.push(b)})});let l=await r(p),c={},m=0;return u.forEach(f=>{let h=t[f].paths.length,b=new Gt(l.slice(m,m+h));s[f].forEach(C=>{let k=b.slice(C.groupOffset,C.groupOffset+C.sizeBytes),v=su(k,[C.manifestEntry]);for(let I in v)c[I]=v[I]}),m+=h}),c}}var IC="application/octet-stream",EC="application/json",li=class{constructor(t,e){if(this.DEFAULT_METHOD="POST",e==null&&(e={}),this.weightPathPrefix=e.weightPathPrefix,this.weightUrlConverter=e.weightUrlConverter,e.fetchFunc!=null?(w(typeof e.fetchFunc=="function",()=>"Must pass a function that matches the signature of `fetch` (see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)"),this.fetch=e.fetchFunc):this.fetch=L().platform.fetch,w(t!=null&&t.length>0,()=>"URL path for http must not be null, undefined or empty."),Array.isArray(t)&&w(t.length===2,()=>`URL paths for http must have a length of 2, (actual length is ${t.length}).`),this.path=t,e.requestInit!=null&&e.requestInit.body!=null)throw new Error("requestInit is expected to have no pre-existing body, but has one.");this.requestInit=e.requestInit||{},this.loadOptions=e}async save(t){if(t.modelTopology instanceof ArrayBuffer)throw new Error("BrowserHTTPRequest.save() does not support saving model topology in binary formats yet.");let e=Object.assign({method:this.DEFAULT_METHOD},this.requestInit);e.body=new FormData;let o=[{paths:["./model.weights.bin"],weights:t.weightSpecs}],n=iu(t,o);if(e.body.append("model.json",new Blob([JSON.stringify(n)],{type:EC}),"model.json"),t.weightData!=null){let i=Gt.join(t.weightData);e.body.append("model.weights.bin",new Blob([i],{type:IC}),"model.weights.bin")}let s=await this.fetch(this.path,e);if(s.ok)return{modelArtifactsInfo:tr(t),responses:[s]};throw new Error(`BrowserHTTPRequest.save() failed due to HTTP response status ${s.status}.`)}async loadModelJSON(){let t=await this.fetch(this.path,this.requestInit);if(!t.ok)throw new Error(`Request to ${this.path} failed with status code ${t.status}. Please verify this URL points to the model JSON of the model to load.`);let e;try{e=await t.json()}catch{let i=`Failed to parse model JSON of response from ${this.path}.`;throw this.path.endsWith(".pb")?i+=" Your path contains a .pb file extension. Support for .pb models have been removed in TensorFlow.js 1.0 in favor of .json models. You can re-convert your Python TensorFlow model using the TensorFlow.js 1.0 conversion scripts or you can convert your.pb models with the 'pb2json'NPM script in the tensorflow/tfjs-converter repository.":i+=" Please make sure the server is serving valid JSON for this request.",new Error(i)}let o=e.modelTopology,n=e.weightsManifest;if(o==null&&n==null)throw new Error(`The JSON from HTTP path ${this.path} contains neither model topology or manifest for weights.`);return e}async load(){if(this.loadOptions.streamWeights)return this.loadStream();let t=await this.loadModelJSON();return gs(t,e=>this.loadWeights(e))}async loadStream(){let t=await this.loadModelJSON(),e=await this.getWeightUrls(t.weightsManifest),o=pi(t.weightsManifest),n=()=>Oh(e,this.loadOptions);return Object.assign(Object.assign({},t),{weightSpecs:o,getWeightStream:n})}async getWeightUrls(t){let e=Array.isArray(this.path)?this.path[1]:this.path,[o,n]=$C(e),s=this.weightPathPrefix||o,i=[],a=[];for(let u of t)for(let p of u.paths)this.weightUrlConverter!=null?a.push(this.weightUrlConverter(p)):i.push(s+p+n);return this.weightUrlConverter&&i.push(...await Promise.all(a)),i}async loadWeights(t){let e=await this.getWeightUrls(t),o=pi(t),n=await bc(e,this.loadOptions);return[o,n]}};li.URL_SCHEME_REGEX=/^https?:\/\//;function $C(r){let t=r.lastIndexOf("/"),e=r.lastIndexOf("?"),o=r.substring(0,t),n=e>t?r.substring(e):"";return[o+"/",n]}function pu(r){return r.match(li.URL_SCHEME_REGEX)!=null}var Uh=(r,t)=>{if(typeof fetch>"u"&&(t==null||t.fetchFunc==null))return null;{let e=!0;if(Array.isArray(r)?e=r.every(o=>pu(o)):e=pu(r),e)return lu(r,t)}return null};Pt.registerSaveRouter(Uh);Pt.registerLoadRouter(Uh);function lu(r,t){return new li(r,t)}function Vh(r,t){return lu(r,t)}var ci=class{constructor(t){this.modelArtifacts=t}load(){return this.modelArtifacts}},cu=class{constructor(t){this.saveHandler=t}save(t){return this.saveHandler(t)}},Sc=class{constructor(t){t.load&&(this.load=()=>Promise.resolve(t.load())),t.save&&(this.save=e=>Promise.resolve(t.save(e)))}};function Hh(r,t,e,o){let n=arguments;return new Sc(Cc(...n))}function Cc(r,t,e,o){return arguments.length===1?r.modelTopology!=null||r.weightSpecs!=null?new ci(r):(console.warn("Please call tf.io.fromMemory() with only one argument. The argument should be of type ModelArtifacts. The multi-argument signature of tf.io.fromMemory() has been deprecated and will be removed in a future release."),new ci({modelTopology:r})):(console.warn("Please call tf.io.fromMemory() with only one argument. The argument should be of type ModelArtifacts. The multi-argument signature of tf.io.fromMemory() has been deprecated and will be removed in a future release."),new ci({modelTopology:r,weightSpecs:t,weightData:e,trainingConfig:o}))}function qh(r){return new cu(r)}function Kh(r){return new cu(r)}var bs="://",We=class r{constructor(){this.managers={}}static getInstance(){return r.instance==null&&(r.instance=new r),r.instance}static registerManager(t,e){w(t!=null,()=>"scheme must not be undefined or null."),t.endsWith(bs)&&(t=t.slice(0,t.indexOf(bs))),w(t.length>0,()=>"scheme must not be an empty string.");let o=r.getInstance();w(o.managers[t]==null,()=>`A model store manager is already registered for scheme '${t}'.`),o.managers[t]=e}static getManager(t){let e=r.getInstance().managers[t];if(e==null)throw new Error(`Cannot find model manager for scheme '${t}'`);return e}static getSchemes(){return Object.keys(r.getInstance().managers)}};function mu(r){if(r.indexOf(bs)===-1)throw new Error(`The url string provided does not contain a scheme. Supported schemes are: ${We.getSchemes().join(",")}`);return{scheme:r.split(bs)[0],path:r.split(bs)[1]}}async function Xh(r,t,e=!1){w(r!==t,()=>`Old path and new path are the same: '${r}'`);let o=Pt.getLoadHandlers(r);w(o.length>0,()=>`Copying failed because no load handler is found for source URL ${r}.`),w(o.length<2,()=>`Copying failed because more than one (${o.length}) load handlers for source URL ${r}.`);let n=o[0],s=Pt.getSaveHandlers(t);w(s.length>0,()=>`Copying failed because no save handler is found for destination URL ${t}.`),w(s.length<2,()=>`Copying failed because more than one (${o.length}) save handlers for destination URL ${t}.`);let i=s[0],a=mu(r).scheme,u=mu(r).path,p=a===mu(r).scheme,l=await n.load();e&&p&&await We.getManager(a).removeModel(u);let c=await i.save(l);return e&&!p&&await We.getManager(a).removeModel(u),c.modelArtifactsInfo}async function jh(){let r=We.getSchemes(),t={};for(let e of r){let o=await We.getManager(e).listModels();for(let n in o){let s=e+bs+n;t[s]=o[n]}}return t}async function Yh(r){let t=mu(r);return We.getManager(t.scheme).removeModel(t.path)}async function Zh(r,t){return Xh(r,t,!1)}async function Qh(r,t){return Xh(r,t,!0)}var eg={};Ht(eg,{confusionMatrix:()=>tg});function NC(r,t,e=1,o=0,n="int32"){if(t<2)throw new Error(`Error in oneHot: depth must be >=2, but it is ${t}`);let i={indices:d(r,"indices","oneHot","int32")},a={dtype:n,depth:t,onValue:e,offValue:o};return y.runKernel(Tn,i,a)}var fu=g({oneHot_:NC});function TC(r,t,e){let o=d(r,"labels","confusionMatrix"),n=d(t,"predictions","confusionMatrix");w(e==null||e>0&&Number.isInteger(e),()=>`If provided, numClasses must be a positive integer, but got ${e}`),w(o.rank===1,()=>`Expected the rank of labels to be 1, but got ${o.rank}`),w(n.rank===1,()=>`Expected the rank of predictions to be 1, but got ${n.rank}`),w(o.shape[0]===n.shape[0],()=>`Mismatch in the number of examples: ${o.shape[0]} vs. ${n.shape[0]}. Labels and predictions should have the same number of elements.`),w(e>0&&Number.isInteger(e),()=>`numClasses is required to be a positive integer, but got ${e}`);let s=fu(_(o,"int32"),e),i=fu(_(n,"int32"),e),a=te(s),u=nt(a,i);return _(u,"int32")}var tg=g({confusionMatrix_:TC});var sg={};Ht(sg,{draw:()=>BC,fromPixels:()=>zC,fromPixelsAsync:()=>PC,toPixels:()=>_C});function vc(r,t,e){if(de(r),t!=null&&t.length!==3)throw new Error("tensor3d() requires shape to have three numbers");let o=Lt(r,e);if(o.length!==3&&o.length!==1)throw new Error("tensor3d() requires values to be number[][][] or flat/TypedArray");if(o.length===1&&t==null)throw new Error("tensor3d() requires shape to be provided when `values` are a flat array");return Yt(r,t,o,e)}var co,rg=!1;function og(r,t=3){if(t>4)throw new Error("Cannot construct Tensor with more than 4 channels from pixels.");if(r==null)throw new Error("pixels passed to tf.browser.fromPixels() can not be null");let e=!1,o=!1,n=!1,s=!1,i=!1,a=!1;if(r.data instanceof Uint8Array)e=!0;else if(typeof ImageData<"u"&&r instanceof ImageData)o=!0;else if(typeof HTMLVideoElement<"u"&&r instanceof HTMLVideoElement)n=!0;else if(typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement)s=!0;else if(r.getContext!=null)i=!0;else if(typeof ImageBitmap<"u"&&r instanceof ImageBitmap)a=!0;else throw new Error(`pixels passed to tf.browser.fromPixels() must be either an HTMLVideoElement, HTMLImageElement, HTMLCanvasElement, ImageData in browser, or OffscreenCanvas, ImageData in webworker or {data: Uint32Array, width: number, height: number}, but was ${r.constructor.name}`);if(is(Ws,y.backendName)!=null){let h={pixels:r},b={numChannels:t};return y.runKernel(Ws,h,b)}let[p,l]=n?[r.videoWidth,r.videoHeight]:[r.width,r.height],c;if(i)c=r.getContext("2d").getImageData(0,0,p,l).data;else if(o||e)c=r.data;else if(s||n||a){if(co==null)if(typeof document>"u")if(typeof OffscreenCanvas<"u"&&typeof OffscreenCanvasRenderingContext2D<"u")co=new OffscreenCanvas(1,1).getContext("2d");else throw new Error("Cannot parse input in current context. Reason: OffscreenCanvas Context2D rendering is not supported.");else co=document.createElement("canvas").getContext("2d",{willReadFrequently:!0});co.canvas.width=p,co.canvas.height=l,co.drawImage(r,0,0,p,l),c=co.getImageData(0,0,p,l).data}let m;if(t===4)m=new Int32Array(c);else{let h=p*l;m=new Int32Array(h*t);for(let b=0;b<h;b++)for(let x=0;x<t;++x)m[b*t+x]=c[b*4+x]}return vc(m,[l,p,t],"int32")}function DC(r){return r!=null&&r.data instanceof Uint8Array}function AC(){return typeof window<"u"&&typeof ImageBitmap<"u"&&window.hasOwnProperty("createImageBitmap")}function RC(r){return r!=null&&r.width!==0&&r.height!==0}function FC(r){return AC()&&!(r instanceof ImageBitmap)&&RC(r)&&!DC(r)}async function PC(r,t=3){let e=null;if(L().getBool("WRAP_TO_IMAGEBITMAP")&&FC(r)){let o;try{o=await createImageBitmap(r,{premultiplyAlpha:"none"})}catch{o=null}o!=null&&o.width===r.width&&o.height===r.height?e=o:e=r}else e=r;return og(e,t)}function ng(r){if(r.rank!==2&&r.rank!==3)throw new Error(`toPixels only supports rank 2 or 3 tensors, got rank ${r.rank}.`);let t=r.rank===2?1:r.shape[2];if(t>4||t===2)throw new Error(`toPixels only supports depth of size 1, 3 or 4 but got ${t}`);if(r.dtype!=="float32"&&r.dtype!=="int32")throw new Error(`Unsupported type for toPixels: ${r.dtype}. Please use float32 or int32 tensors.`)}function MC(r){let t=r?.alpha||1;if(t>1||t<0)throw new Error(`Alpha value ${t} is suppoed to be in range [0 - 1].`)}async function _C(r,t){let e=d(r,"img","toPixels");if(!(r instanceof xt)){let p=e;e=_(p,"int32"),p.dispose()}ng(e);let[o,n]=e.shape.slice(0,2),s=e.rank===2?1:e.shape[2],i=await e.data(),a=e.dtype==="float32"?255:1,u=new Uint8ClampedArray(n*o*4);for(let p=0;p<o*n;++p){let l=[0,0,0,255];for(let m=0;m<s;m++){let f=i[p*s+m];if(e.dtype==="float32"){if(f<0||f>1)throw new Error(`Tensor values for a float32 Tensor must be in the range [0 - 1] but encountered ${f}.`)}else if(e.dtype==="int32"&&(f<0||f>255))throw new Error(`Tensor values for a int32 Tensor must be in the range [0 - 255] but encountered ${f}.`);s===1?(l[0]=f*a,l[1]=f*a,l[2]=f*a):l[m]=f*a}let c=p*4;u[c+0]=Math.round(l[0]),u[c+1]=Math.round(l[1]),u[c+2]=Math.round(l[2]),u[c+3]=Math.round(l[3])}if(t!=null){rg||is(zs,y.backendName)!=null&&(console.warn("tf.browser.toPixels is not efficient to draw tensor on canvas. Please try tf.browser.draw instead."),rg=!0),t.width=n,t.height=o;let p=t.getContext("2d"),l=new ImageData(u,n,o);p.putImageData(l,0,0)}return e!==r&&e.dispose(),u}function BC(r,t,e){let o=d(r,"img","draw");if(!(r instanceof xt)){let i=o;o=_(i,"int32"),i.dispose()}ng(o),MC(e?.imageOptions);let n={image:o},s={canvas:t,options:e};y.runKernel(zs,n,s)}var zC=g({fromPixels_:og});var ag={};Ht(ag,{prepareAndValidate:()=>ig});function ig(r,t){let e=r.shape.length,o=t.shape.length;if(e<1)throw new Error(`tf.gatherND() expects the input to be rank 1 or higher, but the rank was ${e}.`);if(o<1)throw new Error(`tf.gatherND() expects the indices to be rank 1 or higher, but the rank was ${o}.`);if(t.dtype!=="int32")throw new Error(`tf.gatherND() expects the indices to be int32 type, but the dtype was ${t.dtype}.`);if(t.shape[o-1]>e)throw new Error(`index innermost dimension length must be <= tensor rank; saw: ${t.shape[o-1]} vs. ${e}`);if(rt(r.shape)===0)throw new Error(`Requested more than 0 entries, but input is empty. Input shape: ${r.shape}.`);let n=t.shape,s=n[n.length-1],i=1;for(let c=0;c<n.length-1;++c)i*=n[c];let a=r.shape,u=n.slice();u.pop();let p=1;for(let c=s;c<e;++c)p*=a[c],u.push(a[c]);let l=[...Xe(r.shape).map(c=>c/p),1].slice(0,s);return[u,i,p,l]}var du={};Ht(du,{calculateShapes:()=>ug,validateInput:()=>ws,validateUpdateShape:()=>kc});function kc(r,t,e){let o=t.rank>1?t.shape[t.rank-1]:1,n=t.rank>1?t.rank-1:1,s=`Must have updates.shape = indices.shape[:batchDim] + shape[sliceDim:], got updates.shape: ${e.shape}, indices.shape: ${t.shape}, shape: ${r}, sliceDim: ${o}, and batchDim: ${n}.`;if(e.rank<n)throw new Error(s+` update.rank < ${n}. `);if(r.length<o+(e.rank-n))throw new Error(s+` Output shape length < ${o+(e.rank-n)}`);if(e.rank!==n+r.length-o)throw new Error(s+` update.rank != ${n+r.length-o}`);for(let i=0;i<n;++i)if(e.shape[i]!==t.shape[i])throw new Error(s+` updates.shape[${i}] (${e.shape[i]}) != indices.shape[${i}] (${t.shape[i]}).`);for(let i=0;i<e.rank-n;++i)if(e.shape[i+n]!==r[i+o])throw new Error(s+` updates.shape[${i+n}] (${e.shape[i+n]}) != shape[${i+n}] (${r[i+n]})`)}function ws(r,t,e){if(t.rank<1)throw new Error(`tf.scatterND() expects the indices to be rank 1 or higher, but the rank was ${t.rank}.`);if(r.rank<1)throw new Error(`tf.scatterND() expects the updates to be rank 1 or higher, but the rank was ${r.rank}.`);if(t.dtype!=="int32")throw new Error(`The dtype of 'indices' should be int32, but got dtype: ${t.dtype}`);if(e.length<1)throw new Error(`Output rank must be greater or equal to 1, but got shape: ${e}`);if(e.length===0){if(t.size===0)throw new Error(`Indices specified for empty output. indices shape: ${t.shape}`);if(r.size===0)throw new Error(`Updates specified for empty output. updates shape: ${r.shape}`)}kc(e,t,r)}function ug(r,t,e){let o=t.shape.length,n=o>1?t.shape[o-1]:1,s=e.length,i=1;for(let c=n;c<s;++c)i*=e[c];let a=n<1?1:n,u=rt(t.shape)/a,p=[...Xe(e.slice(0,n)),1],l=rt(e);return{sliceRank:n,numUpdates:u,sliceSize:i,strides:p,outputSize:l}}var be={};Ht(be,{assertParamsValid:()=>GC,computeFlatOffset:()=>HC,computeOutShape:()=>WC,getNormalizedAxes:()=>UC,isSliceContinous:()=>VC,maskToAxes:()=>OC,parseSliceParams:()=>Ec,sliceInfo:()=>qC,startForAxis:()=>gg,startIndicesWithElidedDims:()=>fg,stopForAxis:()=>xg,stopIndicesWithElidedDims:()=>dg,stridesForAxis:()=>hg,stridesWithElidedDims:()=>lg});var Ic=-2,LC=-1;function GC(r,t,e){let o=r.shape.length;w(o===t.length,()=>`Error in slice${o}D: Length of begin ${t} must match the rank of the array (${o}).`),w(o===e.length,()=>`Error in slice${o}D: Length of size ${e} must match the rank of the array (${o}).`);for(let n=0;n<o;++n)w(t[n]+e[n]<=r.shape[n],()=>`Error in slice${o}D: begin[${n}] + size[${n}] (${t[n]+e[n]}) would overflow input.shape[${n}] (${r.shape[n]})`)}function OC(r){let t=[],e=0;for(;r>0;)r&1&&t.push(e),r/=2,e++;return t}function WC(r,t,e){let o=[];for(let n=0;n<r.length;n++)o[n]=Math.ceil((t[n]-r[n])/e[n]);return o}function lg(r,t,e,o){let n=[...r];for(let s=n.length;s<o.length;s++)n.push(1);for(let s=0;s<e;s++)s===0?n[t]=1:(n.splice(t,0,1),n.pop());return n}function cg(r,t,e){return e<=r?e:e-(t-1)}function mg(r,t){let e=[];for(let o=0;o<r;o++)e.push(t+o);return e}function UC(r,t,e,o,n,s,i,a,u){let p=r.length,l=new Array(p),c=new Array(p),m=new Array(p);if(t.length&&e>0){let f=t[0],h=e+1;l=fg(i,f,h,o,r),c=dg(a,f,h,n,r),m=lg(s,f,h,r)}else for(let f=0;f<p;f++)l[f]=gg(i,o,s,r,f,u),c[f]=xg(a,n,s,r,f,u),m[f]=hg(s,f,u);return{begin:l,end:c,strides:m}}function fg(r,t,e,o,n){let s=[...n],i=mg(e,t);for(let a=0;a<s.length;a++)if(i.indexOf(a)>-1)s[a]=0;else{let u=cg(t,e,a),p=o[u];r&1<<u&&(p=0),s[a]=p}return s}function dg(r,t,e,o,n){let s=[...n],i=mg(e,t);for(let a=0;a<s.length;a++)if(i.indexOf(a)>-1)s[a]=Number.MAX_SAFE_INTEGER;else{let u=cg(t,e,a),p=o[u];r&1<<u&&(p=Number.MAX_SAFE_INTEGER),s[a]=p}for(let a=0;a<s.length;a++){let u=n[a];s[a]<0&&(s[a]+=u),s[a]=es(0,s[a],n[a])}return s}function hg(r,t,e){let o=r[t];return(e&1<<t||o==null)&&(o=1),o}function gg(r,t,e,o,n,s){let i=t[n],a=e[n]||1;(r&1<<n||s&1<<n||i==null)&&(a>0?i=Number.MIN_SAFE_INTEGER:i=Number.MAX_SAFE_INTEGER);let u=o[n];return i<0&&(i+=u),i=es(0,i,u-1),i}function xg(r,t,e,o,n,s){let i=t[n],a=e[n]||1;(r&1<<n||s&1<<n||i==null)&&(a>0?i=Number.MAX_SAFE_INTEGER:i=Number.MIN_SAFE_INTEGER);let u=o[n];return i<0&&(i+=u),a>0?i=es(0,i,u):i=es(-1,i,u-1),i}function VC(r,t,e){let o=e.length;for(let n=0;n<e.length;n++)if(e[n]>1){o=n;break}for(let n=o+1;n<e.length;n++)if(t[n]>0||e[n]!==r[n])return!1;return!0}function HC(r,t){let e=r.length>0?r[r.length-1]:1;for(let o=0;o<r.length-1;o++)e+=r[o]*t[o];return e}function Ec(r,t,e){let o,n=r.shape.length;typeof t=="number"?o=[t,...new Array(n-1).fill(0)]:t.length<n?o=t.concat(new Array(n-t.length).fill(0)):o=t.slice(),o.forEach(i=>{w(i!==-1,()=>"slice() does not support negative begin indexing.")});let s;return e==null?s=new Array(n).fill(-1):typeof e=="number"?s=[e,...new Array(n-1).fill(-1)]:e.length<n?s=e.concat(new Array(n-e.length).fill(-1)):s=e,s=s.map((i,a)=>i>=0?i:(w(i===-1,()=>`Negative size values should be exactly -1 but got ${i} for the slice() size at index ${a}.`),r.shape[a]-o[a])),[o,s]}function qC(r,t,e,o,n,s,i,a,u){let p;if(o==null?(p=new Array(t.length),p.fill(1)):p=o,i!=null&&(i&i-1)!==0)throw new Error("Multiple ellipses in slice is not allowed.");let l=!1,c={dims:p.length,numAddAxisAfterEllipsis:0,begin:t.slice(),end:e.slice(),strides:p.slice(),beginMask:n,endMask:s,ellipsisMask:i,newAxisMask:a,shrinkAxisMask:u};for(let v=0;v<c.dims;v++)l&&(1<<v&a)!==0&&c.numAddAxisAfterEllipsis++,1<<v&i&&(l=!0);l||(c.ellipsisMask|=1<<c.dims,c.dims++);let m={dims:r.length,beginMask:0,endMask:0,beginValid:!1,endValid:!1};KC(c,m);let f=!0,h=!0,b=!0,x=[],C=[];for(let v=0;v<r.length;++v){if(m.strides[v]===0)throw Error(`strides[${v}] must be non-zero`);let I=!!(m.shrinkAxisMask&1<<v),T=r[v];if(T===-1){x.push(I?1:-1);continue}let R=[m.beginMask&1<<v,m.endMask&1<<v],M=[m.strides[v]>0?0:-1,m.strides[v]>0?T:T-1];if(I&&m.strides[v]<=0)throw Error("only stride 1 allowed on non-range indexing.");b=b&&m.strides[v]===1;let z=!!(m.beginMask&1<<v&&m.endMask&1<<v);if(m.beginValid&&m.endValid){if(I){let J=m.begin[v]<0?T+m.begin[v]:m.begin[v];if(m.begin[v]=J,m.end[v]=m.begin[v]+1,J<0||J>=T)throw Error(`slice index ${m.begin[v]} of dimension ${v} out of bounds.`)}else m.begin[v]=pg(m.begin[v],0,m.strides[v],T,R,M),m.end[v]=pg(m.end[v],1,m.strides[v],T,R,M);let Y=m.strides[v]===1&&m.begin[v]===0&&m.end[v]===T;f=f&&Y,h=h&&(v===0&&m.strides[v]===1||Y)}else f=f&&m.strides[v]===1&&z,h=h&&(v===0&&m.strides[v]===1||z);let B,H=!1;if(m.beginValid&&m.endValid?(B=m.end[v]-m.begin[v],H=!0):I?(B=1,H=!0):z&&T>=0&&(m.strides[v]<0?B=-T:B=T,H=!0),H){let Y;B===0||B<0!=m.strides[v]<0?Y=0:Y=Math.trunc(B/m.strides[v])+(B%m.strides[v]!==0?1:0),x.push(Y)}else x.push(-1)}for(let v=0;v<m.finalShapeGatherIndices.length;++v){let I=m.finalShapeGatherIndices[v];I>=0?C.push(x[I]):I===Ic&&C.push(1)}return{finalShapeSparse:C.filter((v,I)=>m.finalShapeGatherIndices[I]!==Ic),finalShape:C,isIdentity:f,sliceDim0:h,isSimpleSlice:b,begin:m.begin,end:m.end,strides:m.strides}}function KC(r,t){t.beginMask=0,t.endMask=0,t.shrinkAxisMask=0;let e=0;t.beginValid=r.begin!=null,t.endValid=r.end!=null,t.begin=new Array(t.dims),t.end=new Array(t.dims),t.strides=new Array(t.dims),t.finalShapeGatherIndices=[],t.finalShapeGatherIndicesSparse=[],t.inputShapeGatherIndicesSparse=new Array(t.dims);for(let o=0;o<r.dims;o++)if(1<<o&r.ellipsisMask){let n=Math.min(t.dims-(r.dims-o)+1+r.numAddAxisAfterEllipsis,t.dims);for(;e<n;e++)t.begin[e]=0,t.end[e]=0,t.strides[e]=1,t.beginMask|=1<<e,t.endMask|=1<<e,t.finalShapeGatherIndices.push(e),t.finalShapeGatherIndicesSparse.push(-1),t.inputShapeGatherIndicesSparse[e]=o}else if(1<<o&r.newAxisMask)t.finalShapeGatherIndices.push(Ic),t.finalShapeGatherIndicesSparse.push(-1);else{if(e===t.begin.length)throw Error(`Index out of range using input dim ${e}; input has only ${t.dims} dims, ${t.begin.length}.`);r.begin!=null&&(t.begin[e]=r.begin[o]),r.end!=null&&(t.end[e]=r.end[o]),t.strides[e]=r.strides[o],r.beginMask&1<<o&&(t.beginMask|=1<<e),r.endMask&1<<o&&(t.endMask|=1<<e),r.shrinkAxisMask&1<<o?(t.finalShapeGatherIndices.push(LC),t.finalShapeGatherIndicesSparse.push(-1),t.shrinkAxisMask|=1<<e):(t.finalShapeGatherIndices.push(e),t.finalShapeGatherIndicesSparse.push(o)),t.inputShapeGatherIndicesSparse[e]=o,e++}}function pg(r,t,e,o,n,s){if(n[t])return e>0?s[t]:s[t+1&1];{let i=r<0?o+r:r;return i<s[0]?s[0]:i>s[1]?s[1]:i}}var yg={};Ht(yg,{Serializable:()=>mi,SerializationMap:()=>hu,getRegisteredName:()=>jC,registerClass:()=>Nc});var XC=new Map,$c=new Map,mi=class{getClassName(){return this.constructor.className}static fromConfig(t,e){return new t(e)}},hu=class r{constructor(){this.classNameMap={}}static getMap(){return r.instance==null&&(r.instance=new r),r.instance}static register(t){r.getMap().classNameMap[t.className]=[t,t.fromConfig]}};function Nc(r,t,e){w(r.className!=null,()=>"Class being registered does not have the static className property defined."),w(typeof r.className=="string",()=>"className is required to be a string, but got type "+typeof r.className),w(r.className.length>0,()=>"Class being registered has an empty-string as its className, which is disallowed."),typeof t>"u"&&(t="Custom"),typeof e>"u"&&(e=r.className);let o=e,n=t+">"+o;return hu.register(r),XC.set(n,r),$c.set(r,n),r}function jC(r){return $c.has(r)?$c.get(r):r.className}var Sg={};Ht(Sg,{TEST_EPSILON_FLOAT16:()=>bg,createVideoElement:()=>ov,encodeStrings:()=>wg,expectArrayBuffersEqual:()=>rv,expectArraysClose:()=>ZC,expectArraysEqual:()=>JC,expectNumbersClose:()=>tv,expectPromiseToFail:()=>QC,expectValuesInRange:()=>ev,play:()=>nv,testEpsilon:()=>Dc});var YC=.001,bg=.1;function ZC(r,t,e){return e==null&&(e=Dc()),Tc(r,t,(o,n)=>Ac(o,n,e))}function Dc(){return y.backend.floatPrecision()===32?YC:bg}function Tc(r,t,e){let o=!0;if((Dt(r)||Dt(t))&&(o=!1),Dt(r)&&Dt(t)&&(o=!0),o){let i=r.constructor.name,a=t.constructor.name;if(i!==a)throw new Error(`Arrays are of different type. Actual: ${i}. Expected: ${a}`)}if(Array.isArray(r)&&Array.isArray(t)){let i=Lt(r),a=Lt(t);if(!Xt(i,a))throw new Error(`Arrays have different shapes. Actual: [${i}]. Expected: [${a}]`)}let n=Dt(r)?r:ze(r),s=Dt(t)?t:ze(t);if(n.length!==s.length)throw new Error(`Arrays have different lengths actual: ${n.length} vs expected: ${s.length}.
Actual:   ${n}.
Expected: ${s}.`);for(let i=0;i<s.length;++i){let a=n[i],u=s[i];if(!e(a,u))throw new Error(`Arrays differ: actual[${i}] = ${a}, expected[${i}] = ${u}.
Actual:   ${n}.
Expected: ${s}.`)}typeof expect<"u"&&expect().nothing()}function QC(r,t){r().then(()=>t.fail(),()=>t()),typeof expect<"u"&&expect().nothing()}function JC(r,t){let e=typeof t=="string"||typeof t=="number"||typeof t=="boolean"?[t]:t;return _e(r)||_e(r[0])||_e(t)||_e(t[0])?Tc(r,e,(o,n)=>o==n):Tc(r,t,(o,n)=>Ac(o,n,0))}function tv(r,t,e){if(e==null&&(e=Dc()),!Ac(r,t,e))throw new Error(`Numbers differ: actual === ${r}, expected === ${t}`);typeof expect<"u"&&expect().nothing()}function Ac(r,t,e){return!isFinite(r)&&!isFinite(t)?!0:!(isNaN(r)||isNaN(t)||Math.abs(r-t)>e)}function ev(r,t,e){for(let o=0;o<r.length;o++)if(r[o]<t||r[o]>e)throw new Error(`Value out of range:${r[o]} low: ${t}, high: ${e}`)}function rv(r,t){let e=new Float32Array(r),o=new Float32Array(t);if(e.length!==o.length)throw new Error(`Expected ArrayBuffer to be of length ${o.length}, but it was ${e.length}`);for(let n=0;n<o.length;n++)if(e[n]!==o[n])throw new Error(`Expected ArrayBuffer value at ${n} to be ${o[n]} but got ${e[n]} instead`)}function wg(r){for(let t=0;t<r.length;t++){let e=r[t];Array.isArray(e)?wg(e):r[t]=Wr(e)}return r}function ov(r){let t=document.createElement("video");return"playsInline"in t&&(t.playsInline=!0),t.muted=!0,t.loop=!0,t.style.position="fixed",t.style.left="0px",t.style.top="0px",t.preload="auto",t.appendChild(r),new Promise(e=>{t.addEventListener("loadeddata",o=>e(t)),t.load()})}async function nv(r){await r.play(),"requestVideoFrameCallback"in r&&await new Promise(t=>{r.requestVideoFrameCallback(t)})}var sv="4.22.0";function iv(r){let t=d(r,"x","abs");if(t.dtype==="complex64"){let e={x:t};return y.runKernel(Qo,e)}else{let e={x:t};return y.runKernel("Abs",e)}}var Ot=g({abs_:iv});function av(r){let e={x:d(r,"x","acos")};return y.runKernel(Bo,e)}var uv=g({acos_:av});function pv(r){let e={x:d(r,"x","acosh")};return y.runKernel(zo,e)}var lv=g({acosh_:pv});function cv(r){w(Array.isArray(r),()=>"The argument passed to tf.addN() must be a list of tensors"),w(r.length>=1,()=>`Must pass at least one tensor to tf.addN(), but got ${r.length}`);let t=r.map((n,s)=>d(n,`tensors${s}`,"addN")),e=t[0];t.forEach(n=>{if(n.dtype!==e.dtype)throw new Error("All tensors passed to tf.addN() must have the same dtype")}),t.forEach(n=>{if(!Xt(n.shape,e.shape))throw new Error("All tensors passed to tf.addN() must have the same shape")});let o=t;return y.runKernel(Lo,o)}var mv=g({addN_:cv});function fv(r,t=null,e=!1){let n={x:d(r,"x","all","bool")},s={axis:t,keepDims:e};return y.runKernel("All",n,s)}var dv=g({all_:fv});function hv(r,t=null,e=!1){let n={x:d(r,"x","any","bool")},s={axis:t,keepDims:e};return y.runKernel("Any",n,s)}var gv=g({any_:hv});function xv(r,t=0){let o={x:d(r,"x","argMax")},n={axis:t};return y.runKernel(Go,o,n)}var yv=g({argMax_:xv});function bv(r,t=0){let o={x:d(r,"x","argMin")},n={axis:t};return y.runKernel(Oo,o,n)}var wv=g({argMin_:bv});function Sv(r){let e={x:d(r,"x","asin")};return y.runKernel(Wo,e)}var Cv=g({asin_:Sv});function vv(r){let e={x:d(r,"x","asinh")};return y.runKernel(Uo,e)}var kv=g({asinh_:vv});function Iv(r){let e={x:d(r,"x","atan")};return y.runKernel(Vo,e)}var Ev=g({atan_:Iv});function $v(r,t){let e=d(r,"a","atan2"),o=d(t,"b","atan2");[e,o]=ot(e,o);let n={a:e,b:o};return y.runKernel(qo,n)}var Nv=g({atan2_:$v});function Tv(r){let e={x:d(r,"x","atanh")};return y.runKernel(Ho,e)}var Dv=g({atanh_:Tv});function Av(r,t,e,o,n){let s=d(r,"x","avgPool","float32"),i=1;w(Bt(e,i),()=>`Error in avgPool: Either strides or dilations must be 1. Got strides ${e} and dilations '${i}'`);let a=s,u=!1;s.rank===3&&(u=!0,a=E(s,[1,s.shape[0],s.shape[1],s.shape[2]])),w(a.rank===4,()=>`Error in avgPool: x must be rank 4 but got rank ${a.rank}.`),ft("avgPool",o,n);let p={x:a},l={filterSize:t,strides:e,pad:o,dimRoundingMode:n},c=y.runKernel(Ko,p,l);return c=_(c,s.dtype),u?E(c,[c.shape[1],c.shape[2],c.shape[3]]):c}var Rc=g({avgPool_:Av});function Rv(r,t,e,o,n,s="NDHWC"){let i=d(r,"x","avgPool3d","float32"),a=i,u=!1;i.rank===4&&(u=!0,a=E(i,[1,i.shape[0],i.shape[1],i.shape[2],i.shape[3]])),w(a.rank===5,()=>`Error in avgPool3d: x must be rank 5 but got rank ${a.rank}.`),w(s==="NDHWC",()=>`Error in avgPool3d: Only NDHWC is currently supported, but got dataFormat of ${s}`),w(typeof e=="number"&&e>0||Array.isArray(e)&&e[0]>0&&e[1]>0&&e[2]>0,()=>`Error in avgPool3d: Stride must be > 0, but got '${e}'`),ft("avgPool3d",o,n);let p={x:a},l={filterSize:t,strides:e,pad:o,dimRoundingMode:n,dataFormat:s},c=y.runKernel(Xo,p,l);return c=_(c,a.dtype),u?E(c,[c.shape[1],c.shape[2],c.shape[3],c.shape[4]]):c}var Fv=g({avgPool3d_:Rv});function Pv(r,t=0){w(r.length>=1,()=>"Pass at least one tensor to concat");let e=lr(r,"tensors","concat","string_or_numeric");if(e[0].dtype==="complex64"&&e.forEach(s=>{if(s.dtype!=="complex64")throw new Error(`Cannot concatenate complex64 tensors with a tensor
          with dtype ${s.dtype}. `)}),e.length===1)return Oe(e[0]);let o=e,n={axis:t};return y.runKernel(Jo,o,n)}var Et=g({concat_:Pv});function Mv(r){let e={x:d(r,"x","sigmoid","float32")};return y.runKernel(Mr,e)}var Ue=g({sigmoid_:Mv});function _v(r){let e={x:d(r,"x","tanh","float32")};return y.runKernel(Yn,e)}var gu=g({tanh_:_v});function Bv(r,t,e,o,n,s){let i=d(r,"forgetBias","basicLSTMCell"),a=d(t,"lstmKernel","basicLSTMCell"),u=d(e,"lstmBias","basicLSTMCell"),p=d(o,"data","basicLSTMCell"),l=d(n,"c","basicLSTMCell"),c=d(s,"h","basicLSTMCell"),m=Et([p,c],1),f=nt(m,a),h=O(f,u),b=h.shape[0],x=h.shape[1]/4,C=[b,x],k=at(h,[0,0],C),v=at(h,[0,x],C),I=at(h,[0,x*2],C),T=at(h,[0,x*3],C),R=O($(Ue(k),gu(v)),$(l,Ue(O(i,I)))),M=$(gu(R),Ue(T));return[R,M]}var zv=g({basicLSTMCell_:Bv});function Lv(r,t,e){let o=d(r,"x","batchToSpaceND"),n=t.reduce((a,u)=>a*u);w(o.rank>=1+t.length,()=>`input rank is ${o.rank} but should be > than blockShape.length ${t.length}`),w(e.length===t.length,()=>`crops.length is ${e.length} but should be equal to blockShape.length  ${t.length}`),w(o.shape[0]%n===0,()=>`input tensor batch is ${o.shape[0]} but is not divisible by the product of the elements of blockShape ${t.join(" * ")} === ${n}`);let s={x:o},i={blockShape:t,crops:e};return y.runKernel(Yo,s,i)}var fi=g({batchToSpaceND_:Lv});function Cg(r){let t;return r.rank===0||r.rank===1?t=E(r,[1,1,1,r.size]):r.rank===2?t=E(r,[1,1,r.shape[0],r.shape[1]]):r.rank===3?t=E(r,[1,r.shape[0],r.shape[1],r.shape[2]]):t=r,t}function Gv(r,t,e,o,n,s){s==null&&(s=.001);let i=d(r,"x","batchNorm"),a=d(t,"mean","batchNorm"),u=d(e,"variance","batchNorm"),p;n!=null&&(p=d(n,"scale","batchNorm"));let l;o!=null&&(l=d(o,"offset","batchNorm")),w(a.rank===u.rank,()=>"Batch normalization gradient requires mean and variance to have equal ranks."),w(l==null||a.rank===l.rank,()=>"Batch normalization gradient requires mean and offset to have equal ranks."),w(p==null||a.rank===p.rank,()=>"Batch normalization gradient requires mean and scale to have equal ranks.");let m={x:Cg(i),scale:p,offset:l,mean:a,variance:u},f={varianceEpsilon:s},h=y.runKernel(mn,m,f);return E(h,i.shape)}var mo=g({batchNorm_:Gv});function Ov(r,t,e,o,n,s){let i=d(r,"x","batchNorm"),a=d(t,"mean","batchNorm"),u=d(e,"variance","batchNorm"),p;n!=null&&(p=d(n,"scale","batchNorm"));let l;return o!=null&&(l=d(o,"offset","batchNorm")),w(i.rank===2,()=>`Error in batchNorm2D: x must be rank 2 but got rank ${i.rank}.`),w(a.rank===2||a.rank===1,()=>`Error in batchNorm2D: mean must be rank 2 or rank 1 but got rank ${a.rank}.`),w(u.rank===2||u.rank===1,()=>`Error in batchNorm2D: variance must be rank 2 or rank 1 but got rank ${u.rank}.`),p!=null&&w(p.rank===2||p.rank===1,()=>`Error in batchNorm2D: scale must be rank 2 or rank 1 but got rank ${p.rank}.`),l!=null&&w(l.rank===2||l.rank===1,()=>`Error in batchNorm2D: offset must be rank 2 or rank 1 but got rank ${l.rank}.`),mo(i,a,u,l,p,s)}var Wv=g({batchNorm2d_:Ov});function Uv(r,t,e,o,n,s){let i=d(r,"x","batchNorm"),a=d(t,"mean","batchNorm"),u=d(e,"variance","batchNorm"),p;n!=null&&(p=d(n,"scale","batchNorm"));let l;return o!=null&&(l=d(o,"offset","batchNorm")),w(i.rank===3,()=>`Error in batchNorm3D: x must be rank 3 but got rank ${i.rank}.`),w(a.rank===3||a.rank===1,()=>`Error in batchNorm3D: mean must be rank 3 or rank 1 but got rank ${a.rank}.`),w(u.rank===3||u.rank===1,()=>`Error in batchNorm3D: variance must be rank 3 or rank 1 but got rank ${u.rank}.`),p!=null&&w(p.rank===3||p.rank===1,()=>`Error in batchNorm3D: scale must be rank 3 or rank 1 but got rank ${p.rank}.`),l!=null&&w(l.rank===3||l.rank===1,()=>`Error in batchNorm3D: offset must be rank 3 or rank 1 but got rank ${l.rank}.`),mo(i,a,u,l,p,s)}var Vv=g({batchNorm3d_:Uv});function Hv(r,t,e,o,n,s){let i=d(r,"x","batchNorm"),a=d(t,"mean","batchNorm"),u=d(e,"variance","batchNorm"),p;n!=null&&(p=d(n,"scale","batchNorm"));let l;return o!=null&&(l=d(o,"offset","batchNorm")),w(i.rank===4,()=>`Error in batchNorm4D: x must be rank 4 but got rank ${i.rank}.`),w(a.rank===4||a.rank===1,()=>`Error in batchNorm4D: mean must be rank 4 or rank 1 but got rank ${a.rank}.`),w(u.rank===4||u.rank===1,()=>`Error in batchNorm4D: variance must be rank 4 or rank 1 but got rank ${u.rank}.`),p!=null&&w(p.rank===4||p.rank===1,()=>`Error in batchNorm4D: scale must be rank 4 or rank 1 but got rank ${p.rank}.`),l!=null&&w(l.rank===4||l.rank===1,()=>`Error in batchNorm4D: offset must be rank 4 or rank 1 but got rank ${l.rank}.`),mo(i,a,u,l,p,s)}var qv=g({batchNorm4d_:Hv});function Kv(r,t,e){let o=d(r,"x","bincount"),n=d(t,"weights","bincount");w(o.dtype==="int32",()=>`Error in bincount: input dtype must be int32, but got ${o.dtype}`),w(e>=0,()=>`size must be non-negative, but got ${e}.`),w(n.size===o.size||n.size===0,()=>`Error in bincount: weights must have the same size as input or0-length, but got input shape: ${o.shape}, weights shape: ${n.shape}.`);let s={x:o,weights:n},i={size:e};return y.runKernel(Bi,s,i)}var Fc=g({bincount_:Kv});function Xv(r,t){let e=d(r,"x","bitwiseAnd"),o=d(t,"y","bitwiseAnd");if(!Xt(e.shape,o.shape))throw new Error(`BitwiseAnd: Tensors must have the same shape. x: ${e.shape}, y: ${o.shape}`);if(e.dtype!=="int32"||o.dtype!=="int32")throw new Error(`BitwiseAnd: Only supports 'int32' values in tensor, found type of x: ${e.dtype} and type of y: ${o.dtype}`);let n={a:e,b:o};return y.runKernel(zi,n)}var jv=g({bitwiseAnd_:Xv});function Yv(r,t){let e=d(r,"s0","broadcastArgs","int32"),o=d(t,"s1","broadcastArgs","int32");if(e.rank!==1)throw new Error(`broadcastArgs(): first input must be a vector (rank=1). Has rank ${e.rank}`);if(o.rank!==1)throw new Error(`broadcastArgs(): second input must be a vector (rank=1). Has rank ${o.rank}`);let n={s0:e,s1:o};return y.runKernel(Li,n)}var Zv=g({broadcastArgs_:Yv});function st(r,t="float32",e){return t=t||"float32",wt(r),new he(r,t,e)}function Qv(r){let e={x:d(r,"x","ceil","float32")};return y.runKernel(Er,e)}var Jv=g({ceil_:Qv});function yr(r,t,e){wt(r),e=e||Gr(t);let o={shape:r,value:t,dtype:e};return y.runKernel(ra,{},o)}function tk(r,t,e){let o=d(r,"x","clipByValue");if(w(t<=e,()=>`Error in clip: min (${t}) must be less than or equal to max (${e}).`),t===e)return yr(o.shape,t,o.dtype);let n={x:o},s={clipValueMin:t,clipValueMax:e};return y.runKernel(Zo,n,s)}var ek=g({clipByValue_:tk});function rk(r){return Et(r,0)}var ok=g({concat1d_:rk});function nk(r,t){return Et(r,t)}var sk=g({concat2d_:nk});function ik(r,t){return Et(r,t)}var ak=g({concat3d_:ik});function uk(r,t){return Et(r,t)}var pk=g({concat4d_:uk});function lk(r,t,e,o,n="NWC",s=1,i){let a=d(r,"x","conv1d"),u=d(t,"filter","conv1d"),p=a,l=!1;a.rank===2&&(l=!0,p=E(a,[1,a.shape[0],a.shape[1]])),w(p.rank===3,()=>`Error in conv1d: input must be rank 3, but got rank ${p.rank}.`),w(u.rank===3,()=>`Error in conv1d: filter must be rank 3, but got rank ${u.rank}.`),ft("conv1d",o,i),w(p.shape[2]===u.shape[1],()=>`Error in conv1d: depth of input (${p.shape[2]}) must match input depth for filter ${u.shape[1]}.`),w(Bt(e,s),()=>`Error in conv1D: Either stride or dilation must be 1. Got stride ${e} and dilation '${s}'`),w(Ye(s),()=>"Error in conv1D: Dilated rates should be larger than 0."),w(Ye(e),()=>"Error in conv1D: Stride should be larger than 0."),w(n==="NWC",()=>`Error in conv1d: got dataFormat of ${n} but only NWC is currently supported.`);let c=E(u,[1,u.shape[0],u.shape[1],u.shape[2]]),m=E(p,[p.shape[0],1,p.shape[1],p.shape[2]]),x=fr(m,c,[1,e],o,"NHWC",[1,s],i);return l?E(x,[x.shape[2],x.shape[3]]):E(x,[x.shape[0],x.shape[2],x.shape[3]])}var ck=g({conv1d_:lk});function mk(r,t,e,o,n,s){let i=d(r,"x","conv2dTranspose"),a=d(t,"filter","conv2dTranspose");return ds(e,i,a,o,n,"NHWC",s)}var fk=g({conv2dTranspose_:mk});function dk(r,t,e,o,n="NDHWC",s=[1,1,1]){let i=d(r,"x","conv3d"),a=d(t,"filter","conv3d"),u=i,p=!1;i.rank===4&&(p=!0,u=E(i,[1,i.shape[0],i.shape[1],i.shape[2],i.shape[3]])),w(u.rank===5,()=>`Error in conv3d: input must be rank 5, but got rank ${u.rank}.`),w(a.rank===5,()=>`Error in conv3d: filter must be rank 5, but got rank ${a.rank}.`),w(u.shape[4]===a.shape[3],()=>`Error in conv3d: depth of input (${u.shape[4]}) must match input depth for filter ${a.shape[3]}.`),w(Bt(e,s),()=>`Error in conv3D: Either strides or dilations must be 1. Got strides ${e} and dilations '${s}'`),w(n==="NDHWC",()=>`Error in conv3d: got dataFormat of ${n} but only NDHWC is currently supported.`),w(Ye(s),()=>"Error in conv3D: Dilated rates should be larger than 0."),w(Ye(e),()=>"Error in conv3D: Strides should be larger than 0.");let l={x:u,filter:a},c={strides:e,pad:o,dataFormat:n,dilations:s},m=y.runKernel(rn,l,c);return p?E(m,[m.shape[1],m.shape[2],m.shape[3],m.shape[4]]):m}var hk=g({conv3d_:dk});function gk(r,t,e,o,n){let s=d(r,"x","conv3dTranspose"),i=d(t,"filter","conv3dTranspose");return tu(e,s,i,o,n)}var xk=g({conv3dTranspose_:gk});function yk(r){let e={x:d(r,"x","cos","float32")};return y.runKernel("Cos",e)}var di=g({cos_:yk});function bk(r){let e={x:d(r,"x","cosh","float32")};return y.runKernel(on,e)}var Pc=g({cosh_:bk});function wk(r,t=0,e=!1,o=!1){let s={x:d(r,"x","cumprod")},i={axis:t,exclusive:e,reverse:o};return y.runKernel(Vi,s,i)}var xu=g({cumprod_:wk});function Sk(r,t,e,o=!1){let n=d(r,"x","denseBincount"),s=d(t,"weights","denseBincount");w(n.dtype==="int32",()=>`Error in denseBincount: input dtype must be int32, but got ${n.dtype}`),w(n.rank<=2,()=>`Error in denseBincount: input must be at most rank 2, but got rank ${n.rank}.`),w(e>=0,()=>`size must be non-negative, but got ${e}.`),w(s.size===n.size||s.size===0,()=>`Error in denseBincount: weights must have the same shape as x or 0-length, but got x shape: ${n.shape}, weights shape: ${s.shape}.`);let i={x:n,weights:s},a={size:e,binaryOutput:o};return y.runKernel(qi,i,a)}var Ck=g({denseBincount_:Sk});function vk(r,t,e="NHWC"){let o=d(r,"x","depthToSpace","float32"),n=e==="NHWC"?o.shape[1]:o.shape[2],s=e==="NHWC"?o.shape[2]:o.shape[3],i=e==="NHWC"?o.shape[3]:o.shape[1];w(t>1,()=>`blockSize should be > 1 for depthToSpace, but was: ${t}`),w(n*t>=0,()=>`Negative dimension size caused by overflow when multiplying
    ${n} and ${t}  for depthToSpace with input shape
    ${o.shape}`),w(s*t>=0,()=>`Negative dimension size caused by overflow when multiplying
    ${s} and ${t} for depthToSpace with input shape
        ${o.shape}`),w(i%(t*t)===0,()=>`Dimension size must be evenly divisible by ${t*t} but is ${i} for depthToSpace with input shape ${o.shape}`);let a={x:o},u={blockSize:t,dataFormat:e};return y.runKernel(Ki,a,u)}var kk=g({depthToSpace_:vk});function Ik(r,t,e,o,n="NHWC",s=[1,1],i){let a=d(r,"x","depthwiseConv2d","float32"),u=d(t,"filter","depthwiseConv2d","float32"),p=a,l=!1;a.rank===3&&(l=!0,p=E(a,[1,a.shape[0],a.shape[1],a.shape[2]])),w(p.rank===4,()=>`Error in depthwiseConv2d: input must be rank 4, but got rank ${p.rank}.`),w(u.rank===4,()=>`Error in depthwiseConv2d: filter must be rank 4, but got rank ${u.rank}.`);let c=n==="NHWC"?p.shape[3]:p.shape[1];w(c===u.shape[2],()=>`Error in depthwiseConv2d: number of input channels (${c}) must match the inChannels dimension in filter ${u.shape[2]}.`),ft("depthwiseConv2d",o,i);let m={x:p,filter:u},f={strides:e,pad:o,dataFormat:n,dilations:s,dimRoundingMode:i},h=y.runKernel(sn,m,f);return l?E(h,[h.shape[1],h.shape[2],h.shape[3]]):h}var hi=g({depthwiseConv2d_:Ik});function Ek(r){let e={x:d(r,"x","diag")};return y.runKernel(Yi,e)}var $k=g({diag_:Ek});function Nk(r,t,e,o,n=[1,1],s="NHWC"){let i=d(r,"x","dilation2d"),a=d(t,"filter","dilation2d");w(i.rank===3||i.rank===4,()=>`Error in dilation2d: input must be rank 3 or 4, but got rank ${i.rank}.`),w(a.rank===3,()=>`Error in dilation2d: filter must be rank 3, but got rank ${a.rank}.`),w(s==="NHWC",()=>`Error in dilation2d: Only NHWC is currently supported, but got dataFormat of ${s}`);let u=i,p=!1;i.rank===3&&(u=E(i,[1,i.shape[0],i.shape[1],i.shape[2]]),p=!0),w(u.shape[3]===a.shape[2],()=>`Error in dilation2d:  input and filter must have the same depth: ${u.shape[3]} vs ${a.shape[2]}`);let l={x:u,filter:a},c={strides:e,pad:o,dilations:n},m=y.runKernel(an,l,c);return p?E(m,[m.shape[1],m.shape[2],m.shape[3]]):m}var Tk=g({dilation2d_:Nk});function Dk(r,t){let e=d(r,"a","div"),o=d(t,"b","div");[e,o]=ot(e,o);let n=V(e,o),s=Z(n),i=ai(o,s);return It(i,s,n)}var Ak=g({divNoNan_:Dk});function Rk(r,t){let e=d(r,"t1","dot"),o=d(t,"t2","dot");w((e.rank===1||e.rank===2)&&(o.rank===1||o.rank===2),()=>`Error in dot: inputs must all be rank 1 or 2, but got ranks ${e.rank} and ${o.rank}.`);let n=e.rank===1?e.size:e.shape[1],s=o.rank===1?o.size:o.shape[0];if(w(n===s,()=>`Error in dot: inner dimensions of inputs must match, but got ${n} and ${s}.`),e.rank===1&&o.rank===1){let i=E(e,[1,-1]),a=E(o,[-1,1]),u=nt(i,a);return E(u,[])}else if(e.rank===1&&o.rank===2){let i=E(e,[1,-1]),a=E(o,[o.shape[0],o.shape[1]]),u=nt(i,a);return E(u,[u.size])}else if(e.rank===2&&o.rank===1){let i=E(o,[-1,1]),a=nt(e,i);return E(a,[a.size])}else{let i=E(o,[o.shape[0],o.shape[1]]);return nt(e,i)}}var Fk=g({dot_:Rk});function Pk(r,...t){let e=t.map((n,s)=>d(n,`tensors${s}`,"einsum")),o={equation:r};return y.runKernel(Ji,e,o)}var fo=g({einsum_:Pk});function Mk(r){let e={x:d(r,"x","elu","float32")};return y.runKernel("Elu",e)}var Mc=g({elu_:Mk});function _k(r,t){let e=d(r,"x","ensureShape","string_or_numeric");if(!bl(e.shape,t))throw new Error(`EnsureShape: Shape of tensor ${e.shape} is not compatible with expected shape ${t}`);return r}var Bk=g({ensureShape_:_k});function zk(r){let t=d(r,"x","erf");w(t.dtype==="int32"||t.dtype==="float32",()=>"Input dtype must be `int32` or `float32`."),t.dtype==="int32"&&(t=_(t,"float32"));let e={x:t};return y.runKernel("Erf",e)}var Lk=g({erf_:zk});function Gk(r,t=null,e=!1){let n={x:d(r,"x","max")},s={reductionIndices:t,keepDims:e};return y.runKernel("Max",n,s)}var br=g({max_:Gk});function Ok(r,t=null,e=!1){let n={x:d(r,"x","min")},s={axis:t,keepDims:e};return y.runKernel("Min",n,s)}var yu=g({min_:Ok});function Wk(r,t="euclidean",e=null,o=!1){r=d(r,"x","norm");let n=vg(r,t,e),s=n.shape;if(o){let i=Rt(e,r.shape);s=Ne(n.shape,i)}return E(n,s)}function vg(r,t,e=null){if(r.rank===0)return Ot(r);if(r.rank!==1&&e===null)return vg(E(r,[-1]),t,e);if(r.rank===1||typeof e=="number"||Array.isArray(e)&&e.length===1){if(t===1)return K(Ot(r),e);if(t===1/0)return br(Ot(r),e);if(t===-1/0)return yu(Ot(r),e);if(t==="euclidean"||t===2)return At(K(De(Ot(r),X(2,"int32")),e));throw new Error(`Error in norm: invalid ord value: ${t}`)}if(Array.isArray(e)&&e.length===2){if(t===1)return br(K(Ot(r),e[0]),e[1]-1);if(t===1/0)return br(K(Ot(r),e[1]),e[0]);if(t===-1/0)return yu(K(Ot(r),e[1]),e[0]);if(t==="fro"||t==="euclidean")return At(K(tt(r),e));throw new Error(`Error in norm: invalid ord value: ${t}`)}throw new Error(`Error in norm: invalid axis: ${e}`)}var Ss=g({norm_:Wk});function Uk(r,t=null,e=!1){return Ss(r,"euclidean",t,e)}var Vk=g({euclideanNorm_:Uk});function Hk(r,t=0){let e=d(r,"x","expandDims","string_or_numeric");w(t<=e.rank,()=>"Axis must be <= rank of the tensor");let o={input:e},n={dim:t};return y.runKernel(cn,o,n)}var Ae=g({expandDims_:Hk});function qk(r){let e={x:d(r,"x","expm1")};return y.runKernel($r,e)}var Kk=g({expm1_:qk});function Xk(r,t,e,o="float32"){t==null&&(t=r);let n=st([r,t],o),s=r<=t?r:t;for(let a=0;a<s;++a)n.set(1,a,a);let i=E(n.toTensor(),[r,t]);if(e==null)return i;if(e.length===1)return dr(Ae(i,0),[e[0],1,1]);if(e.length===2)return dr(Ae(Ae(i,0),0),[e[0],e[1],1,1]);if(e.length===3)return dr(Ae(Ae(Ae(i,0),0),0),[e[0],e[1],e[2],1,1]);throw new Error(`eye() currently supports only 1D and 2D batchShapes, but received ${e.length}D.`)}var _c=g({eye_:Xk});function jk(r,t,e=0,o=0){let n=d(r,"x","gather"),s=d(t,"indices","gather","int32"),i={x:n,indices:s},a={axis:e,batchDims:o};return y.runKernel(fn,i,a)}var gi=g({gather_:jk});function Yk(r){let e={x:d(r,"x","isFinite")};return y.runKernel(hn,e)}var Zk=g({isFinite_:Yk});function Qk(r){let e={x:d(r,"x","isInf")};return y.runKernel(gn,e)}var Jk=g({isInf_:Qk});function tI(r){let e={x:d(r,"x","isNaN")};return y.runKernel(xn,e)}var eI=g({isNaN_:tI});function rI(r,t=.2){let o={x:d(r,"x","leakyRelu")},n={alpha:t};return y.runKernel(yn,o,n)}var Bc=g({leakyRelu_:rI});function oI(r,t,e){if(e<=0)throw new Error("The number of values should be positive.");let o={start:r,stop:t,num:e};return y.runKernel(aa,{},o)}function nI(r,t=5,e=1,o=1,n=.5){let s=d(r,"x","localResponseNormalization");w(s.rank===4||s.rank===3,()=>`Error in localResponseNormalization: x must be rank 3 or 4 but got
               rank ${s.rank}.`),w(ur(t),()=>`Error in localResponseNormalization: depthRadius must be an integer but got depthRadius ${t}.`);let i=s,a=!1;s.rank===3&&(a=!0,i=E(s,[1,s.shape[0],s.shape[1],s.shape[2]]));let u={x:i},p={depthRadius:t,bias:e,alpha:o,beta:n},l=y.runKernel("LRN",u,p);return a?E(l,[l.shape[1],l.shape[2],l.shape[3]]):l}var sI=g({localResponseNormalization_:nI});function iI(r){let e={x:d(r,"x","log1p")};return y.runKernel(Cn,e)}var zc=g({log1p_:iI});function aI(r){return w(Ke(r),()=>"The f passed in grad(f) must be a function"),(t,e)=>{let o=d(t,"x","tf.grad","string_or_numeric"),n=e!=null?d(e,"dy","tf.grad"):null;return y.tidy(()=>{let{value:s,grads:i}=y.gradients(()=>r(o),[o],n);return n!=null&&yt(s.shape,n.shape,"The shape of dy passed in grad(f)(x, dy) must match the shape returned by f(x)"),bu(i),i[0]})}}function uI(r){return w(Ke(r),()=>"The f passed in grads(f) must be a function"),(t,e)=>{w(Array.isArray(t),()=>"The args passed in grads(f)(args) must be an array of `Tensor`s or `TensorLike`s");let o=lr(t,"args","tf.grads","string_or_numeric"),n=e!=null?d(e,"dy","tf.grads"):null;return y.tidy(()=>{let{value:s,grads:i}=y.gradients(()=>r(...o),o,n);return n!=null&&yt(s.shape,n.shape,"The shape of dy passed in grads(f)([x1,...], dy) must match the shape returned by f([x1,...])"),bu(i),i})}}function pI(r){return w(Ke(r),()=>"The f passed in valueAndGrad(f) must be a function"),(t,e)=>{w(t instanceof xt,()=>"The x passed in valueAndGrad(f)(x) must be a tensor"),w(e==null||e instanceof xt,()=>"The dy passed in valueAndGrad(f)(x, dy) must be a tensor");let{grads:o,value:n}=y.gradients(()=>r(t),[t],e);return bu(o),{grad:o[0],value:n}}}function lI(r){return w(Ke(r),()=>"The f passed in valueAndGrads(f) must be a function"),(t,e)=>{w(Array.isArray(t)&&t.every(n=>n instanceof xt),()=>"The args passed in valueAndGrads(f)(args) must be array of tensors"),w(e==null||e instanceof xt,()=>"The dy passed in valueAndGrads(f)(args, dy) must be a tensor");let o=y.gradients(()=>r(...t),t,e);return e!=null&&yt(o.value.shape,e.shape,"The shape of dy passed in valueAndGrads(f)([x1,...], dy) must match the shape returned by f([x1,...])"),bu(o.grads),o}}function Lc(r,t){w(Ke(r),()=>"The f passed in variableGrads(f) must be a function"),w(t==null||Array.isArray(t)&&t.every(p=>p instanceof pr),()=>"The varList passed in variableGrads(f, varList) must be an array of variables");let e=t!=null;if(!e){t=[];for(let p in y.registeredVariables)t.push(y.registeredVariables[p])}let o=e?t.filter(p=>!p.trainable):null,n=t.length;t=t.filter(p=>p.trainable),w(t.length>0,()=>`variableGrads() expects at least one of the input variables to be trainable, but none of the ${n} variables is trainable.`);let s=!0,{value:i,grads:a}=y.gradients(r,t,null,s);w(a.some(p=>p!=null),()=>"Cannot find a connection between any variable and the result of the loss function y=f(x). Please make sure the operations that use variables are inside the function f passed to minimize()."),w(i.rank===0,()=>`The f passed in variableGrads(f) must return a scalar, but it returned a rank-${i.rank} tensor`);let u={};return t.forEach((p,l)=>{a[l]!=null&&(u[p.name]=a[l])}),o?.forEach(p=>u[p.name]=null),{value:i,grads:u}}function Qt(r){return y.customGrad(r)}function bu(r){if(r.filter(e=>e==null).length>0)throw new Error(`Cannot compute gradient of y=f(x) with respect to x. Make sure that
    the f you passed encloses all operations that lead from x to y.`)}function cI(r){let e={x:d(r,"x","softplus")};return y.runKernel(Hn,e)}var Gc=g({softplus_:cI});function mI(r){let t=d(r,"x","logSigmoid");return Qt(o=>({value:lt(Gc(lt(o))),gradFunc:i=>$(i,Ue(lt(o)))}))(t)}var fI=g({logSigmoid_:mI});function dI(r,t=-1){let e=d(r,"logits","logSoftmax");if(t===-1&&(t=e.rank-1),t!==e.rank-1)throw Error(`Log Softmax along a non-last dimension is not yet supported. Logits was rank ${e.rank} and axis was ${t}`);return Qt((n,s)=>{let a=br(n,t,!0),u=U(n,a),p=U(_(u,"float32"),Je(K(zt(u),t,!0)));return s([p]),{value:p,gradFunc:(c,m)=>{let[f]=m,h=!0,b=zt(f);return U(c,$(K(c,t,h),b))}}})(e)}var hI=g({logSoftmax_:dI});function gI(r,t=null,e=!1){let o=d(r,"x","logSumExp"),n=Rt(t,o.shape),s=br(o,n,!0),i=U(o,s),a=zt(i),u=K(a,n),p=Je(u),l=O(E(s,p.shape),p);if(e){let c=Ne(l.shape,n);return E(l,c)}return l}var Oc=g({logSumExp_:gI});function xI(r){let e={x:d(r,"x","logicalNot","bool")};return y.runKernel(pa,e)}var xi=g({logicalNot_:xI});function yI(r,t){let e=d(r,"a","logicalOr","bool"),o=d(t,"b","logicalOr","bool");Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(la,n)}var Wc=g({logicalOr_:yI});function bI(r,t){let e=d(r,"a","logicalXor","bool"),o=d(t,"b","logicalXor","bool");return Q(e.shape,o.shape),Ze(Wc(r,t),xi(Ze(r,t)))}var wI=g({logicalXor_:bI});var wu=2147483648;function SI(r,t,e="left"){let o=d(r,"sortedSequence","searchSorted"),n=d(t,"values","searchSorted"),s=o.shape[o.shape.length-1],i=n.shape[n.shape.length-1],a=E(o,[-1,s]),u=E(n,[-1,i]);if(a.rank<2)throw new Error("Sorted input argument must be at least 2-dimensional");if(a.shape[0]!==u.shape[0])throw new Error("Leading dimension of 'sortedSequence' and 'values' must match.");if(rt(u.shape)>=wu)throw new Error(`values tensor size must less than ${wu}`);if(a.shape[1]>=wu)throw new Error(`trailing dim_size must less than ${wu} for int32 output type, was ${a.shape[1]}`);let p={sortedSequence:a,values:u},l={side:e};return y.runKernel(Na,p,l)}var Su=g({searchSorted_:SI});function CI(r,t){return Su(r,t,"left")}function vI(r,t,e,o,n){let s=d(r,"x","maxPool"),i=1,a=s,u=!1;s.rank===3&&(u=!0,a=E(s,[1,s.shape[0],s.shape[1],s.shape[2]])),w(a.rank===4,()=>`Error in maxPool: input must be rank 4 but got rank ${a.rank}.`),w(Bt(e,i),()=>`Error in maxPool: Either strides or dilations must be 1. Got strides ${e} and dilations '${i}'`),ft("maxPool",o,n);let p={x:a},l={filterSize:t,strides:e,pad:o,dimRoundingMode:n},c=y.runKernel(vn,p,l);return u?E(c,[c.shape[1],c.shape[2],c.shape[3]]):c}var Uc=g({maxPool_:vI});function kI(r,t=[1,1,1],e,o,n,s="NDHWC"){let i=d(r,"x","maxPool3d"),a=i,u=!1;i.rank===4&&(u=!0,a=E(i,[1,i.shape[0],i.shape[1],i.shape[2],i.shape[3]])),w(a.rank===5,()=>`Error in maxPool3d: x must be rank 5 but got rank ${a.rank}.`),w(s==="NDHWC",()=>`Error in maxPool3d: Only NDHWC is currently supported, but got dataFormat of ${s}`),ft("maxPool3d",o,n);let p={x:a},l={filterSize:t,strides:e,pad:o,dimRoundingMode:n,dataFormat:s},c=y.runKernel(kn,p,l);return u?E(c,[c.shape[1],c.shape[2],c.shape[3],c.shape[4]]):c}var II=g({maxPool3d_:kI});function EI(r,t,e,o,n=!1){let i={x:d(r,"x","maxPoolWithArgmax")},a={filterSize:t,strides:e,pad:o,includeBatchInIndex:n},u=y.runKernel(ga,i,a);return{result:u[0],indexes:u[1]}}var $I=g({maxPoolWithArgmax_:EI});function NI(r,t){let e=d(r,"a","maximum"),o=d(t,"b","maximum");[e,o]=ot(e,o),e.dtype==="bool"&&(e=_(e,"int32"),o=_(o,"int32")),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(Ar,n)}var yi=g({maximum_:NI});function TI(r,t=null,e=!1){let n={x:d(r,"x","mean")},s={axis:t,keepDims:e};return y.runKernel(In,n,s)}var Cs=g({mean_:TI});function DI(r,t,{indexing:e="xy"}={}){if(e!=="xy"&&e!=="ij")throw new TypeError(`${e} is not a valid third argument to meshgrid`);if(r===void 0)return[];let o=d(r,"x","meshgrid",r instanceof xt?r.dtype:"float32");if(t===void 0)return[o];let n=d(t,"y","meshgrid",t instanceof xt?t.dtype:"float32"),s=rt(o.shape),i=rt(n.shape);return e==="xy"?(o=E(o,[1,-1]),n=E(n,[-1,1]),[nt(ee([i,1],o.dtype),o),nt(n,ee([1,s],n.dtype))]):(o=E(o,[-1,1]),n=E(n,[1,-1]),[nt(o,ee([1,i],o.dtype)),nt(ee([s,1],n.dtype),n)])}function AI(r,t){let e=d(r,"a","minimum"),o=d(t,"b","minimum");[e,o]=ot(e,o),e.dtype==="bool"&&(e=_(e,"int32"),o=_(o,"int32")),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel(Rr,n)}var vs=g({minimum_:AI});function RI(r,t,e){w(e==="reflect"||e==="symmetric",()=>`Invalid mode. Mode must be either reflect or symmetric. Got ${e}.`);let o=d(r,"x","mirrorPad");if(o.rank===0)throw new Error("mirrorPad(scalar) is not defined. Pass non-scalar to mirrorPad");w(t.length===o.rank,()=>`Padding doesn't match input. Must be ${o.rank}. Got ${t.length}.`);let n=e==="reflect"?1:0;for(let a=0;a<o.rank;a++)w(t[a].length===2,()=>"Invalid number of paddings. Must be length of 2 each."),w(t[a][0]>=0&&t[a][0]<=o.shape[a]-n&&t[a][1]>=0&&t[a][1]<=o.shape[a]-n,()=>`Padding in dimension ${a} cannot be greater than or equal to ${o.shape[a]-n} or less than 0 for input of shape ${o.shape}`);let s={paddings:t,mode:e},i={x:o};return y.runKernel(En,i,s)}var FI=g({mirrorPad_:RI});function PI(r,t){let e=d(r,"a","mod"),o=d(t,"b","mod");[e,o]=ot(e,o);let n={a:e,b:o};return y.runKernel("Mod",n)}var MI=g({mod_:PI});function _I(r,t=null,e=!1){r=d(r,"x","moments");let o=Rt(t,r.shape),n=Cs(r,o,e),s=n.shape;e||(s=Ne(n.shape,o));let i=tt(U(_(r,"float32"),E(n,s))),a=Cs(i,o,e);return{mean:n,variance:a}}var BI=g({moments_:_I});function zI(r,t,e,o){let n=d(t,"data","multiRNNCell"),s=lr(e,"c","multiRNNCell"),i=lr(o,"h","multiRNNCell"),a=n,u=[];for(let c=0;c<r.length;c++){let m=r[c](a,s[c],i[c]);u.push(m[0]),u.push(m[1]),a=m[1]}let p=[],l=[];for(let c=0;c<u.length;c+=2)p.push(u[c]),l.push(u[c+1]);return[p,l]}var LI=g({multiRNNCell_:zI});function GI(r,t,e,o=!1){let n=d(r,"logits","multinomial"),s=n.size,i=n.rank;if(s<2)throw new Error(`Error in multinomial: you need at least 2 outcomes, but got ${s}.`);if(i>2)throw new Error(`Rank of probabilities must be 1 or 2, but is ${i}`);e=e||Math.random();let u={logits:i===1?E(n,[1,-1]):n},p={numSamples:t,seed:e,normalized:o},l=y.runKernel(ba,u,p);return i===1?E(l,[l.size]):l}var OI=g({multinomial_:GI});function WI(r,t){let e=d(r,"a","notEqual","string_or_numeric"),o=d(t,"b","notEqual","string_or_numeric");[e,o]=ot(e,o),Q(e.shape,o.shape);let n={a:e,b:o};return y.runKernel($n,n)}var Vc=g({notEqual_:WI});function UI(r){let e={x:d(r,"x","onesLike")};return y.runKernel(Nn,e)}var VI=g({onesLike_:UI});function HI(r,t){let e=d(r,"v1","outerProduct"),o=d(t,"v2","outerProduct");w(e.rank===1&&o.rank===1,()=>`Error in outerProduct: inputs must be rank 1, but got ranks ${e.rank} and ${o.rank}.`);let n=E(e,[-1,1]),s=E(o,[1,-1]);return nt(n,s)}var qI=g({outerProduct_:HI});function KI(r,t,e=0){let o=d(r,"x","pad");if(o.rank===0)throw new Error("pad(scalar) is not defined. Pass non-scalar to pad");let n={paddings:t,constantValue:e},s={x:o};return y.runKernel(An,s,n)}var Ve=g({pad_:KI});function XI(r,t,e=0){return w(t.length===2,()=>"Invalid number of paddings. Must be length of 2."),Ve(r,[t],e)}var jI=g({pad1d_:XI});function YI(r,t,e=0){return w(t.length===2&&t[0].length===2&&t[1].length===2,()=>"Invalid number of paddings. Must be length of 2 each."),Ve(r,t,e)}var ZI=g({pad2d_:YI});function QI(r,t,e=0){return w(t.length===3&&t[0].length===2&&t[1].length===2&&t[2].length===2,()=>"Invalid number of paddings. Must be length of 2 each."),Ve(r,t,e)}var JI=g({pad3d_:QI});function t3(r,t,e=0){return w(t.length===4&&t[0].length===2&&t[1].length===2&&t[2].length===2&&t[3].length===2,()=>"Invalid number of paddings. Must be length of 2 each."),Ve(r,t,e)}var e3=g({pad4d_:t3});function r3(r,t,e,o,n,s,i){n==null&&(n=[1,1]),s==null&&(s=1),o===0&&(o="valid");let a=d(r,"x","maxPool"),u=a,p=!1;a.rank===3&&(p=!0,u=E(a,[1,a.shape[0],a.shape[1],a.shape[2]])),w(Bt(s,n),()=>`Error in pool: Either strides or dilations must be 1. Got strides ${s} and dilations '${n}'`);let l=jl(u.shape,t,s,n,o),c=[l.dilationHeight,l.dilationWidth],m;o==="same"?m=n3([l.filterHeight,l.filterWidth],c):m=[[0,0],[0,0]];let f=c[0]===1&&c[1]===1,[h,b]=o3([l.inHeight,l.inWidth],c,m),x=f?o:"valid",C=f?u:si(u,c,h),v=(e==="avg"?()=>Rc(C,t,s,x,i):()=>Uc(C,t,s,x,i))(),I=f?v:fi(v,c,b);return p?E(I,[I.shape[1],I.shape[2],I.shape[3]]):I}function o3(r,t,e){let o=e.map(l=>l[0]),n=e.map(l=>l[1]),s=r.concat(o,n),i=t.map((l,c)=>(l-s[c]%l)%l),a=n.map((l,c)=>l+i[c]),u=t.map((l,c)=>[o[c],a[c]]),p=t.map((l,c)=>[0,i[c]]);return[u,p]}function n3(r,t){let o=r.map((i,a)=>i+(i-1)*(t[a]-1)).map(i=>i-1),n=o.map(i=>Math.floor(i/2)),s=o.map((i,a)=>i-n[a]);return o.map((i,a)=>[n[a],s[a]])}var s3=g({pool_:r3});function i3(r,t){let e=d(r,"x","prelu"),o=d(t,"alpha","prelu"),n={x:e,alpha:o};return y.runKernel(Rn,n)}var Hc=g({prelu_:i3});function qc(r,t=!1){console.log(r.toString(t))}function a3(r,t=null,e=!1){let o=d(r,"x","prod");o.dtype==="bool"&&(o=_(o,"int32"));let n={x:o},s={axis:t,keepDims:e};return y.runKernel(jr,n,s)}var u3=g({prod_:a3});function p3(r,t,e,o){let n=r.map((l,c)=>d(l,`tensors${c}`,"raggedGather","int32")),s=d(t,"paramsDenseValues","raggedGather"),i=d(e,"indices","raggedGather","int32"),a={paramsNestedSplits:n,paramsDenseValues:s,indices:i},u={outputRaggedRank:o},p=y.runKernel(af,a,u);return{outputNestedSplits:p.slice(0,p.length-1),outputDenseValues:p[p.length-1]}}var l3=g({raggedGather_:p3});function c3(r,t,e){let o=d(r,"starts","raggedRange"),n=d(t,"limits","raggedRange",o.dtype),s=d(e,"deltas","raggedRange",o.dtype),i={starts:o,limits:n,deltas:s},a=y.runKernel(uf,i);return{rtNestedSplits:a[0],rtDenseValues:a[1]}}var m3=g({raggedRange_:c3});function f3(r,t,e,o,n){let s=d(r,"shape","raggedTensorToTensor","int32"),i=d(t,"values","raggedTensorToTensor"),a=d(e,"defaultValue","raggedTensorToTensor",i.dtype),u=o.map((c,m)=>d(c,`tensors${m}`,"raggedTensorToTensor","int32")),p={shape:s,values:i,defaultValue:a,rowPartitionTensors:u},l={rowPartitionTypes:n};return y.runKernel(pf,p,l)}var d3=g({raggedTensorToTensor_:f3});function h3(r,t,e){wt(r);let o=rt(r),n=null;if(e==null||e==="float32")n=new Float32Array(o);else if(e==="int32")n=new Int32Array(o);else if(e==="bool")n=new Uint8Array(o);else throw new Error(`Unknown data type ${e}`);for(let s=0;s<o;s++)n[s]=t();return y.makeTensor(n,r,e)}var g3=g({rand_:h3});var Iu=rf(Gg());var go=class{constructor(t,e,o,n,s){this.mean=t,this.stdDev=e,this.dtype=o,this.nextVal=NaN,this.truncated=n,this.truncated&&(this.upper=this.mean+this.stdDev*2,this.lower=this.mean-this.stdDev*2);let i=s||Math.random();this.random=Iu.alea(i.toString())}nextValue(){if(!isNaN(this.nextVal)){let n=this.nextVal;return this.nextVal=NaN,n}let t,e,o=!1;for(;!o;){let n,s,i;do n=2*this.random()-1,s=2*this.random()-1,i=n*n+s*s;while(i>=1||i===0);let a=Math.sqrt(-2*Math.log(i)/i);t=this.mean+this.stdDev*n*a,e=this.mean+this.stdDev*s*a,(!this.truncated||this.isValidTruncated(t))&&(o=!0)}return(!this.truncated||this.isValidTruncated(e))&&(this.nextVal=this.convertValue(e)),this.convertValue(t)}convertValue(t){return this.dtype==null||this.dtype==="float32"?t:Math.round(t)}isValidTruncated(t){return t<=this.upper&&t>=this.lower}},vu=class{constructor(t,e,o,n){this.alpha=t,this.beta=1/e,this.dtype=o;let s=n||Math.random();this.randu=Iu.alea(s.toString()),this.randn=new go(0,1,o,!1,this.randu()),t<1?this.d=t+2/3:this.d=t-1/3,this.c=1/Math.sqrt(9*this.d)}nextValue(){let t,e,o,n,s,i;for(;;){do n=this.randn.nextValue(),i=1+this.c*n;while(i<=0);if(i*=i*i,t=n*n,e=1-.331*t*t,o=.5*t+this.d*(1-i+Math.log(i)),s=this.randu(),s<e||Math.log(s)<o)break}return i=1/this.beta*this.d*i,this.alpha<1&&(i*=Math.pow(this.randu(),1/this.alpha)),this.convertValue(i)}convertValue(t){return this.dtype==="float32"?t:Math.round(t)}},ku=class{constructor(t=0,e=1,o,n){if(this.canReturnFloat=()=>this.dtype==null||this.dtype==="float32",this.min=t,this.range=e-t,this.dtype=o,n==null&&(n=Math.random()),typeof n=="number"&&(n=n.toString()),!this.canReturnFloat()&&this.range<=1)throw new Error(`The difference between ${t} - ${e} <= 1 and dtype is not float`);this.random=Iu.alea(n)}convertValue(t){return this.canReturnFloat()?t:Math.round(t)}nextValue(){return this.convertValue(this.min+this.range*this.random())}};function v3(r,t,e=1,o="float32",n){if(wt(r),e==null&&(e=1),o==null&&(o="float32"),o!=="float32"&&o!=="int32")throw new Error(`Unsupported data type ${o}`);let s=new vu(t,e,o,n),i=st(r,o);for(let a=0;a<i.values.length;a++)i.values[a]=s.nextValue();return i.toTensor()}var k3=g({randomGamma_:v3});function I3(r,t=0,e=1,o,n){if(wt(r),o!=null&&o==="bool")throw new Error(`Unsupported data type ${o}`);let s=new go(t,e,o,!1,n),i=st(r,o);for(let a=0;a<i.values.length;a++)i.values[a]=s.nextValue();return i.toTensor()}var Jc=g({randomNormal_:I3});function E3(r,t,e){if(t!=null&&t==="bool")throw new Error(`Unsupported data type ${t}`);return Jc(r,0,1,t,e)}var $3=g({randomStandardNormal_:E3});function N3(r,t=0,e=1,o="float32",n){wt(r);let s=st(r,o),i=new ku(t,e,null,n);for(let a=0;a<s.values.length;a++)s.values[a]=i.nextValue();return s.toTensor()}var bi=g({randomUniform_:N3});function T3(r,t,e,o){return bi(r,t,e,"int32",o)}var D3=g({randomUniformInt_:T3});function xo(r,t,e=1,o="float32"){if(e===0)throw new Error("Cannot have a step of zero");let n={start:r,stop:t,step:e,dtype:o};return y.runKernel(va,{},n)}function A3(r){let e={x:d(r,"x","reciprocal")};return y.runKernel(Fn,e)}var R3=g({reciprocal_:A3});function F3(r){let e={x:d(r,"x","relu")};return y.runKernel(Pn,e)}var yo=g({relu_:F3});function P3(r){let e={x:d(r,"x","relu6")};return y.runKernel(zn,e)}var tm=g({relu6_:P3});function M3(r,t){let o={x:d(r,"x","reverse")},n={dims:t};return y.runKernel(Ln,o,n)}var ue=g({reverse_:M3});function _3(r){let t=d(r,"x","reverse");return w(t.rank===1,()=>`Error in reverse1D: x must be rank 1 but got rank ${t.rank}.`),ue(t,0)}var B3=g({reverse1d_:_3});function z3(r,t){let e=d(r,"x","reverse");return w(e.rank===2,()=>`Error in reverse2D: x must be rank 2 but got rank ${e.rank}.`),ue(e,t)}var L3=g({reverse2d_:z3});function G3(r,t){let e=d(r,"x","reverse");return w(e.rank===3,()=>`Error in reverse3D: x must be rank 3 but got rank ${e.rank}.`),ue(e,t)}var O3=g({reverse3d_:G3});function W3(r,t){let e=d(r,"x","reverse");return w(e.rank===4,()=>`Error in reverse4D: x must be rank 4 but got rank ${e.rank}.`),ue(e,t)}var U3=g({reverse4d_:W3});function V3(r){let e={x:d(r,"x","round")};return y.runKernel(Gn,e)}var em=g({round_:V3});function H3(r){let e={x:d(r,"x","selu")};return y.runKernel(Wn,e)}var q3=g({selu_:H3});function K3(r,t,e,o,n,s=[1,1],i="NHWC"){let a=d(r,"x","separableConv2d"),u=d(t,"depthwiseFilter","separableConv2d"),p=d(e,"pointwiseFilter","separableConv2d"),l=a,c=!1;if(a.rank===3&&(c=!0,l=E(a,[1,a.shape[0],a.shape[1],a.shape[2]])),i==="NCHW")throw new Error("separableConv2d currently does not support dataFormat NCHW; only NHWC is supported");w(l.rank===4,()=>`Error in separableConv2d: input must be rank 4, but got rank ${l.rank}.`),w(u.rank===4,()=>`Error in separableConv2d: depthwise filter must be rank 4, but got rank ${u.rank}.`),w(p.rank===4,()=>`Error in separableConv2d: pointwise filter must be rank 4, but got rank ${u.rank}.`),w(p.shape[0]===1,()=>`Error in separableConv2d: the first dimension of pointwise filter  must be 1, but got ${p.shape[0]}.`),w(p.shape[1]===1,()=>`Error in separableConv2d: the second dimension of pointwise filter must be 1, but got ${p.shape[1]}.`);let m=u.shape[2],f=u.shape[3];w(p.shape[2]===m*f,()=>`Error in separableConv2d: the third dimension of pointwise filter must be ${m*f}, but got ${p.shape[2]}.`);let h=hi(l,u,o,n,i,s),x=fr(h,p,1,"valid",i);return c?E(x,[x.shape[1],x.shape[2],x.shape[3]]):x}var X3=g({separableConv2d_:K3});async function j3(r,t){let e=d(r,"x","setdiff1d"),o=d(t,"y","setdiff1d");w(e.dtype===o.dtype,()=>`x and y should have the same dtype, but got x (${e.dtype}) and y (${o.dtype}).`),w(e.rank===1,()=>`x should be 1D tensor, but got x (${e.shape}).`),w(o.rank===1,()=>`y should be 1D tensor, but got y (${o.shape}).`);let n=await e.data(),s=await o.data(),i=new Set(s),a=0;for(let l=0;l<n.length;l++)i.has(n[l])||a++;let u=new he([a],e.dtype),p=new he([a],"int32");for(let l=0,c=0;l<n.length;l++)i.has(n[l])||(u.values[c]=n[l],p.values[c]=l,c++);return[u.toTensor(),p.toTensor()]}var Y3=j3;function Z3(r){let e={x:d(r,"x","sign")};return y.runKernel(Vn,e)}var Q3=g({sign_:Z3});function J3(r,t,e){let o=d(r,"x","slice1d");return w(o.rank===1,()=>`slice1d expects a rank-1 tensor, but got a rank-${o.rank} tensor`),at(o,[t],[e])}var tE=g({slice1d_:J3});function eE(r,t,e){let o=d(r,"x","slice2d");return w(o.rank===2,()=>`slice2d expects a rank-2 tensor, but got a rank-${o.rank} tensor`),at(o,t,e)}var rE=g({slice2d_:eE});function oE(r,t,e){let o=d(r,"x","slice3d");return w(o.rank===3,()=>`slice3d expects a rank-3 tensor, but got a rank-${o.rank} tensor`),at(o,t,e)}var nE=g({slice3d_:oE});function sE(r,t,e){let o=d(r,"x","slice4d");return w(o.rank===4,()=>`slice4d expects a rank-4 tensor, but got a rank-${o.rank} tensor`),at(o,t,e)}var iE=g({slice4d_:sE});function aE(r,t=-1){let e=d(r,"logits","softmax","float32");if(t===-1&&(t=e.rank-1),t!==e.rank-1)throw Error(`Softmax along a non-last dimension is not yet supported. Logits was rank ${e.rank} and dim was ${t}`);let o={logits:e},n={dim:t};return y.runKernel(Xn,o,n)}var uE=g({softmax_:aE});function pE(r){w(r.dtype==="complex64",()=>`The dtype for tf.spectral.fft() must be complex64 but got ${r.dtype}.`);let t={input:r};return y.runKernel("FFT",t)}var wi=g({fft_:pE});function lE(r){w(r.dtype==="complex64",()=>`The dtype for tf.spectral.ifft() must be complex64 but got ${r.dtype}.`);let t={input:r};return y.runKernel(sa,t)}var ks=g({ifft_:lE});function cE(r){let t=r.shape[r.shape.length-1],e=r.size/t,o;if(t<=2){let n=E(r,[e,t]);o=ks(n)}else{let n=[e,2*(t-1)],s=E(Ur(r),[e,t]),i=E(uo(r),[e,t]),a=ue(at(s,[0,1],[e,t-2]),1),u=$(ue(at(i,[0,1],[e,t-2]),1),X(-1)),p=Et([s,a],1),l=Et([i,u],1),c=E(ae(p,l),[n[0],n[1]]);o=ks(c)}if(o=Ur(o),r.rank===3&&r.shape[0]!==0){let n=o,s=r.shape[0];o=E(o,[s,o.shape[0]/s,o.shape[1]]),n.dispose()}return o}var rm=g({irfft_:cE});function mE(r,t){w(r.dtype==="float32",()=>`The dtype for rfft() must be real value but got ${r.dtype}`);let e=r.shape[r.shape.length-1],o=r.size/e,n;if(t!=null&&t<e){let h=r.shape.map(x=>0),b=r.shape.map(x=>x);b[r.shape.length-1]=t,n=at(r,h,b),e=t}else if(t!=null&&t>e){let h=r.shape.map(b=>b);h[r.shape.length-1]=t-e,n=Et([r,ye(h)],r.shape.length-1),e=t}else n=r;let s=Z(n),i=E(ae(n,s),[o,e]),a=wi(i),u=Math.floor(e/2)+1,p=Ur(a),l=uo(a),c=Qe(p,[u,e-u],p.shape.length-1),m=Qe(l,[u,e-u],l.shape.length-1),f=n.shape.slice();return f[n.shape.length-1]=u,E(ae(c[0],m[0]),f)}var Si=g({rfft_:mE});function fE(r,t){let e=d(r,"a","squaredDifference"),o=d(t,"b","squaredDifference");[e,o]=ot(e,o),Q(e.shape,o.shape);let n={a:e,b:o},s={};return y.runKernel(Br,n,s)}var om=g({squaredDifference_:fE});function dE(r,t){let e=d(r,"x","squeeze","string_or_numeric");return E(e,wl(e.shape,t).newShape)}var Ci=g({squeeze_:dE});function hE(r,t,e,o,n=0,s=0,i=0,a=0,u=0){let l={x:d(r,"x","stridedSlice","string_or_numeric")},c={begin:t,end:e,strides:o,beginMask:n,endMask:s,ellipsisMask:i,newAxisMask:a,shrinkAxisMask:u};return y.runKernel(_a,l,c)}var gE=g({stridedSlice_:hE});function xE(r){let e={x:d(r,"x","tan","float32")};return y.runKernel("Tan",e)}var yE=g({tan_:xE});function Wt(r,t){de(r);let e=Lt(r,t);if(e.length!==1)throw new Error("tensor1d() requires values to be a flat/TypedArray");return Yt(r,null,e,t)}function bo(r,t,e){if(de(r),t!=null&&t.length!==2)throw new Error("tensor2d() requires shape to have two numbers");let o=Lt(r,e);if(o.length!==2&&o.length!==1)throw new Error("tensor2d() requires values to be number[][] or flat/TypedArray");if(o.length===1&&t==null)throw new Error("tensor2d() requires shape to be provided when `values` are a flat/TypedArray");return Yt(r,t,o,e)}function bE(r,t,e){if(de(r),t!=null&&t.length!==4)throw new Error("tensor4d() requires shape to have four numbers");let o=Lt(r,e);if(o.length!==4&&o.length!==1)throw new Error("tensor4d() requires values to be number[][][][] or flat/TypedArray");if(o.length===1&&t==null)throw new Error("tensor4d() requires shape to be provided when `values` are a flat array");return Yt(r,t,o,e)}function wE(r,t,e){if(de(r),t!=null&&t.length!==5)throw new Error("tensor5d() requires shape to have five numbers");let o=Lt(r,e);if(o.length!==5&&o.length!==1)throw new Error("tensor5d() requires values to be number[][][][][] or flat/TypedArray");if(o.length===1&&t==null)throw new Error("tensor5d() requires shape to be provided when `values` are a flat array");return Yt(r,t,o,e)}function SE(r,t,e){if(de(r),t!=null&&t.length!==6)throw new Error("tensor6d() requires shape to have six numbers");let o=Lt(r,e);if(o.length!==6&&o.length!==1)throw new Error("tensor6d() requires values to be number[][][][][][] or flat/TypedArray");if(o.length===1&&t==null)throw new Error("tensor6d() requires shape to be provided when `values` are a flat array");return t=t||o,Yt(r,t,o,e)}function CE(r,t,e){let o=d(r,"tensor","tensorScatterupdate"),n=d(t,"indices","tensorScatterupdate","int32"),s=d(e,"updates","tensorScatterupdate");if(ws(s,n,o.shape),o.dtype!==s.dtype)throw new Error(`tensor and updates must have the same dtype, instead they are ${o.dtype} and ${s.dtype}.`);let i={tensor:o,indices:n,updates:s},a={};return y.runKernel($a,i,a)}var vE=g({tensorScatterUpdate_:CE});function kE(r,t=1,e=!0){let o=d(r,"x","topk");if(o.rank===0)throw new Error("topk() expects the input to be of rank 1 or higher");let n=o.shape[o.shape.length-1];if(t<0)throw new Error(`'k' passed to topk() must be >= 0 but got ${t}`);if(t>n)throw new Error(`'k' passed to topk() must be <= the last dimension (${n}) but got ${t}`);let s={x:o},i={k:t,sorted:e},[a,u]=y.runKernel(La,s,i);return{values:a,indices:u}}var IE=g({topk_:kE});function EE(r,t=0,e=1,o,n){if(wt(r),o!=null&&o==="bool")throw new Error("Unsupported data type $ { dtype }");let s=new go(t,e,o,!0,n),i=st(r,o);for(let a=0;a<i.values.length;a++)i.values[a]=s.nextValue();return i.toTensor()}var $E=g({truncatedNormal_:EE});function NE(r,t=0){let e=d(r,"x","unique","string_or_numeric");w(e.rank>0,()=>"The input tensor must be at least 1D");let o={x:e},n={axis:t},[s,i]=y.runKernel(df,o,n);return{values:s,indices:i}}var TE=g({unique_:NE});function DE(r,t){return Su(r,t,"right")}function AE(r,t=!0,e,o){return y.makeVariable(r,t,e,o)}function Eu(r,t){let e=[];for(let s=0;s<t.length;s++)t[s]&&e.push(s);let o=st(r,"int32"),n=st([e.length,r.length],"int32");for(let s=0;s<e.length;s++){let i=o.indexToLoc(e[s]),a=s*r.length;n.values.set(i,a)}return n.toTensor()}async function RE(r){let t=d(r,"condition","whereAsync","bool"),e=await t.data(),o=Eu(t.shape,e);return r!==t&&t.dispose(),o}var nm=RE;async function FE(r,t,e){let o=d(r,"tensor","boolMask"),n=d(t,"mask","boolMask","bool"),s=e??0,i=n.rank,a=o.shape;w(i>0,()=>"mask cannot be scalar"),yt(a.slice(s,s+i),n.shape,"mask's shape must match the first K dimensions of tensor's shape,");let u=1;for(let b=s;b<s+i;b++)u*=a[b];let p=a.slice(0,s).concat([u],a.slice(s+i)),l=E(o,p),c=E(n,[-1]),m=await nm(c),f=Ci(m,[1]),h=gi(l,f,s);return r!==o&&o.dispose(),t!==n&&n.dispose(),f.dispose(),l.dispose(),c.dispose(),m.dispose(),h}var jrt=FE;function PE(r,t,e,o,n=!0){let s=d(r,"v","movingAverage"),i=d(t,"x","movingAverage"),a=d(e,"decay","movingAverage");Vl(s,i),w(Xt(s.shape,i.shape),()=>"Shape mismatch in v and x");let u=X(1),p=U(u,a),l=$(U(i,s),p);if(n){w(o!=null,()=>"When using zeroDebias: true, step is required.");let c=d(o,"step","movingAverage");l=V(l,U(u,De(a,c)))}return O(s,l)}var iot=g({movingAverage_:PE});function ME(r,t,e){wt(e);let o=d(r,"indices","scatterND","int32"),n=d(t,"updates","scatterND");ws(n,o,e);let s={indices:o,updates:n},i={shape:e};return y.runKernel(Ea,s,i)}var fot=g({scatterND_:ME});function Og(r,t,e,o){if(r.dtype!=="int32")throw new Error(`tf.sparseToDense() expects the indices to be int32 type, but the dtype was ${r.dtype}.`);if(r.rank>2)throw new Error(`sparseIndices should be a scalar, vector, or matrix, but got shape ${r.shape}.`);let n=r.rank>0?r.shape[0]:1,s=r.rank>1?r.shape[1]:1;if(e.length!==s)throw new Error(`outputShape has incorrect number of elements:, ${e.length}, should be: ${s}.`);let i=t.size;if(!(t.rank===0||t.rank===1&&i===n))throw new Error(`sparseValues has incorrect shape ${t.shape}, should be [] or [${n}]`);if(t.dtype!==o.dtype)throw new Error("sparseValues.dtype must match defaultValues.dtype")}function BE(r,t,e,o=0){wt(e);let n=d(r,"sparseIndices","sparseToDense","int32"),s=d(t,"sparseValues","sparseToDense","string_or_numeric"),i=d(o,"defaultValue","sparseToDense",s.dtype);Og(n,s,e,i);let a={sparseIndices:n,sparseValues:s,defaultValue:i},u={outputShape:e};return y.runKernel(Fa,a,u)}var wot=g({sparseToDense_:BE});function zE(r,t){let e=d(t,"indices","gatherND","int32"),n={params:d(r,"x","gatherND","string_or_numeric"),indices:e};return y.runKernel(na,n)}var Eot=g({gatherND_:zE});function Wg(r,t){if(t==null)return r.shape.slice();if(Xt(r.shape,t))return t;if(r.shape.length===t.length){let e=[];for(let o=0;o<r.shape.length;o++)t[o]==null&&r.shape[o]!=null?e.push(r.shape[o]):e.push(t[o]);return e}return t}function LE(r,t,e,o){let n=d(r,"x","dropout");if(w(n.dtype==="float32",()=>`x has to be a floating point tensor since it's going to be scaled, but got a ${n.dtype} tensor instead.`),w(t>=0&&t<1,()=>`rate must be a float in the range [0, 1), but got ${t}.`),t===0)return r instanceof xt?n.clone():n;let s=Wg(n,e),i=1-t,a=V(ui(O(bi(s,0,1,"float32",o),i)),i);return $(n,a)}var zot=g({dropout_:LE});function Ug(r){return Math.floor(Math.pow(2,Math.ceil(Math.log(r)/Math.log(2))))}function $u(r,t,e){let o=1-r%2,n=new Float32Array(r);for(let s=0;s<r;++s){let i=2*Math.PI*s/(r+o-1);n[s]=t-e*Math.cos(i)}return Wt(n,"float32")}async function GE(r,t,e=1){let o=d(r,"predictions","inTopK"),n=d(t,"targets","inTopK");w(o.rank>1,()=>`inTopK() expects the predictions to be of rank 2 or higher, but got ${o.rank}`),w(o.rank-1===n.rank,()=>`predictions rank should be 1 larger than targets rank, but got predictions rank ${o.rank} and targets rank ${n.rank}`),yt(o.shape.slice(0,o.shape.length-1),n.shape,"predictions's shape should be align with the targets' shape, except the last dimension.");let s=o.shape[o.shape.length-1];w(e>0&&e<=s,()=>`'k' passed to inTopK() must be > 0 && <= the predictions last dimension (${s}), but got ${e}`);let i=await o.data(),a=await n.data(),[u,p]=[i.length/s,s],l=Sl("bool",u);for(let c=0;c<u;c++){let m=c*p,f=i.subarray(m,m+p),h=[];for(let b=0;b<f.length;b++)h.push({value:f[b],index:b});h.sort((b,x)=>x.value-b.value),l[c]=0;for(let b=0;b<e;b++)if(h[b].index===a[c]){l[c]=1;break}}return r!==o&&o.dispose(),t!==n&&n.dispose(),hr(l,n.shape,"bool")}var Hot=GE;var Kg={};Ht(Kg,{conv2d:()=>Vg,depthwiseConv2d:()=>Hg,matMul:()=>qg});function wo(r,t,e){if(e==null||e==="linear")return r;if(e==="relu")return $(r,cr(t));throw new Error(`Cannot compute gradient for fused activation ${e}.`)}function So(r,t){let e=t,o=mt(r.shape,t.shape);return o.length>0&&(e=K(e,o)),E(e,r.shape)}function Co(r,t,e,o){if(t==="linear")return r;if(t==="relu")return yo(r);if(t==="elu")return Mc(r);if(t==="relu6")return tm(r);if(t==="prelu")return Hc(r,e);if(t==="leakyrelu")return Bc(r,o);if(t==="sigmoid")return Ue(r);throw new Error(`Unknown fused activation ${t}.`)}var vo=(r,t)=>!(r>0)||t==="linear";function OE({x:r,filter:t,strides:e,pad:o,dataFormat:n="NHWC",dilations:s=[1,1],dimRoundingMode:i,bias:a,activation:u="linear",preluActivationWeights:p,leakyreluAlpha:l}){if(u=u||"linear",vo(y.state.gradientDepth,u)===!1){w(n==="NHWC",()=>`Error in fused conv2d: got dataFormat of ${n} but only NHWC is currently supported for the case of gradient depth is 0 and the activation is not linear.`);let R=fr(r,t,e,o,n,s,i);return a!=null&&(R=O(R,a)),Co(R,u,p,l)}let c=d(r,"x","conv2d","float32"),m=d(t,"filter","conv2d","float32"),f=c,h=!1;c.rank===3&&(h=!0,f=E(c,[1,c.shape[0],c.shape[1],c.shape[2]])),w(f.rank===4,()=>`Error in fused conv2d: input must be rank 4, but got rank ${f.rank}.`),w(m.rank===4,()=>`Error in fused conv2d: filter must be rank 4, but got rank ${m.rank}.`),ft("fused conv2d",o,i);let b=n==="NHWC"?f.shape[3]:f.shape[1];w(m.shape[2]===b,()=>`Error in conv2d: depth of input (${b}) must match input depth for filter ${m.shape[2]}.`),w(Bt(e,s),()=>`Error in conv2D: Either strides or dilations must be 1. Got strides ${e} and dilations '${s}'`);let x=io(f.shape,m.shape,e,s,o,i),C;a!=null&&(C=d(a,"bias","fused conv2d"),[C]=ot(C,c),n==="NHWC"?Q(x.outShape,C.shape):(w(C.shape.length<=1,()=>`Error in fused conv2d: only supports scalar or 1-D Tensor bias for NCHW format but got the bias of rank-${C.shape.length}.`),w(C.shape.length===0||C.shape[0]===x.outChannels||C.shape[0]===1,()=>`Error in fused conv2d: bias shape (${C.shape}) is not compatible with the number of output channels (${x.outChannels})`)));let k;if(p!=null){let R=p.shape;if(w(R.length<=1||R.length===3,()=>`Error in fused conv2d: only supports scalar, 1-D Tensor or 3-D Tensor PReLU activation weights but got a tensor of rank-${R.length}.`),R.length===1)w(R[0]===1||R[0]===x.outChannels,()=>`Error in fused conv2d: PReLU activation weights (${R}) is not compatible with the number of output channels (${x.outChannels}).`);else if(R.length===3)try{Q(R,x.outShape)}catch{let z=`Error in fused conv2d: PReLU activation weights (${R}) is not compatible with the output shape of the conv2d (${x.outShape}).`;throw Error(z)}k=d(p,"prelu weights","fused conv2d")}let v=(R,M)=>{w(n==="NHWC",()=>`Error in gradient of fused conv2D: got dataFormat of ${n} but only NHWC is currently supported.`);let[z,B,H,Y]=M,J=wo(R,H,u);w(ge(s),()=>`Error in gradient of fused conv2D: dilation rates greater than 1 are not yet supported in gradients. Got dilations '${s}'`);let it=ds(B.shape,J,z,e,o),ut=fs(B,J,z.shape,e,o),pt=[it,ut];if(Y!=null){let Tt=So(Y,J);pt.push(Tt)}return pt},I={x:f,filter:m,bias:C,preluActivationWeights:k},T={strides:e,pad:o,dataFormat:n,dilations:s,dimRoundingMode:i,activation:u,leakyreluAlpha:l};return a==null?Qt((M,z,B)=>{let H=y.runKernel(Vs,I,T);return B([z,M,H]),h&&(H=E(H,[H.shape[1],H.shape[2],H.shape[3]])),{value:H,gradFunc:v}})(f,m):Qt((M,z,B,H)=>{let Y=y.runKernel(Vs,I,T);return H([z,M,Y,B]),h&&(Y=E(Y,[Y.shape[1],Y.shape[2],Y.shape[3]])),{value:Y,gradFunc:v}})(f,m,C)}var Vg=g({fusedConv2d_:OE});function WE({x:r,filter:t,strides:e,pad:o,dataFormat:n="NHWC",dilations:s=[1,1],dimRoundingMode:i,bias:a,activation:u="linear",preluActivationWeights:p,leakyreluAlpha:l}){if(vo(y.state.gradientDepth,u)===!1){let T=hi(r,t,e,o,n,s,i);return a!=null&&(T=O(T,a)),Co(T,u,p,l)}let c=d(r,"x","depthwiseConv2d","float32"),m=d(t,"filter","depthwiseConv2d","float32"),f=c,h=!1;c.rank===3&&(h=!0,f=E(c,[1,c.shape[0],c.shape[1],c.shape[2]])),w(f.rank===4,()=>`Error in fused depthwiseConv2d: input must be rank 4, but got rank ${f.rank}.`),w(m.rank===4,()=>`Error in fused depthwiseConv2d: filter must be rank 4, but got rank ${m.rank}.`),w(f.shape[3]===m.shape[2],()=>`Error in fused depthwiseConv2d: number of input channels (${f.shape[3]}) must match the inChannels dimension in filter ${m.shape[2]}.`),s==null&&(s=[1,1]),w(Bt(e,s),()=>`Error in fused depthwiseConv2d: Either strides or dilations must be 1. Got strides ${e} and dilations '${s}'`),ft("fused depthwiseConv2d",o,i);let b=io(f.shape,m.shape,e,s,o,i,!0),x;a!=null&&(x=d(a,"bias","fused conv2d"),[x]=ot(x,c),Q(b.outShape,x.shape));let C;p!=null&&(C=d(p,"prelu weights","fused depthwiseConv2d"));let k=(T,R)=>{w(ge(s),()=>`Error in gradient of fused depthwiseConv2d: dilation rates greater than 1 are not yet supported. Got dilations '${s}'`);let[M,z,B,H]=R,Y=wo(T,B,u),J=ou(z.shape,Y,M,e,o,s,i),it=ru(z,Y,M.shape,e,o,s,i);if(H!=null){let ut=So(x,Y);return[J,it,ut]}return[J,it]},v={x:f,filter:m,bias:x,preluActivationWeights:C},I={strides:e,pad:o,dataFormat:n,dilations:s,dimRoundingMode:i,activation:u,leakyreluAlpha:l};return a==null?Qt((R,M,z)=>{let B=y.runKernel(Hs,v,I);return z([M,R,B]),h&&(B=E(B,[B.shape[1],B.shape[2],B.shape[3]])),{value:B,gradFunc:k}})(f,m):Qt((R,M,z,B)=>{let H=y.runKernel(Hs,v,I);return B([M,R,H,z]),h&&(H=E(H,[H.shape[1],H.shape[2],H.shape[3]])),{value:H,gradFunc:k}})(f,m,x)}var Hg=g({fusedDepthwiseConv2d_:WE});function UE({a:r,b:t,transposeA:e=!1,transposeB:o=!1,bias:n,activation:s="linear",preluActivationWeights:i,leakyreluAlpha:a=.2}){if(vo(y.state.gradientDepth,s)===!1){let Y=nt(r,t,e,o);return n!=null&&(Y=O(Y,n)),Co(Y,s,i,a)}let u=d(r,"a","fused matMul"),p=d(t,"b","fused matMul");[u,p]=ot(u,p);let l=e?u.shape[u.rank-2]:u.shape[u.rank-1],c=o?p.shape[p.rank-1]:p.shape[p.rank-2],m=e?u.shape[u.rank-1]:u.shape[u.rank-2],f=o?p.shape[p.rank-2]:p.shape[p.rank-1],h=u.shape.slice(0,-2),b=p.shape.slice(0,-2),x=rt(h),C=rt(b);w(l===c,()=>`Error in fused matMul: inner shapes (${l}) and (${c}) of Tensors with shapes ${u.shape} and ${p.shape} and transposeA=${e} and transposeB=${o} must match.`);let v=Q(u.shape.slice(0,-2),p.shape.slice(0,-2)).concat([m,f]),I=e?E(u,[x,l,m]):E(u,[x,m,l]),T=o?E(p,[C,f,c]):E(p,[C,c,f]),R;n!=null&&(R=d(n,"bias","fused matMul"),[R]=ot(R,u),Q(v,R.shape));let M;i!=null&&(M=d(i,"prelu weights","fused matMul"));let z=(Y,J)=>{let[it,ut,pt,Tt]=J,Me=wo(E(Y,pt.shape),pt,s),fe,Ce;if(!e&&!o?(fe=nt(Me,ut,!1,!0),Ce=nt(it,Me,!0,!1)):!e&&o?(fe=nt(Me,ut,!1,!1),Ce=nt(Me,it,!0,!1)):e&&!o?(fe=nt(ut,Me,!1,!0),Ce=nt(it,Me,!1,!1)):(fe=nt(ut,Me,!0,!0),Ce=nt(Me,it,!0,!0)),n!=null){let Xr=So(Tt,Me);return[fe,Ce,Xr]}else return[fe,Ce]},B={a:I,b:T,bias:R,preluActivationWeights:M},H={transposeA:e,transposeB:o,activation:s,leakyreluAlpha:a};return n==null?Qt((J,it,ut)=>{let pt=y.runKernel(Us,B,H);return ut([J,it,pt]),{value:E(pt,v),gradFunc:z}})(I,T):Qt((J,it,ut,pt)=>{let Tt=y.runKernel(Us,B,H);return pt([J,it,Tt,ut]),{value:E(Tt,v),gradFunc:z}})(I,T,R)}var qg=g({fusedMatMul_:UE});function VE(r){return $u(r,.54,.46)}var Xg=g({hammingWindow_:VE});function HE(r){return $u(r,.5,.5)}var Nu=g({hannWindow_:HE});function qE(r,t,e,o=!1,n=0){let s=0,i=[];for(;s+t<=r.size;)i.push(at(r,s,t)),s+=e;if(o)for(;s<r.size;){let a=s+t-r.size,u=Et([at(r,s,t-a),yr([a],n)]);i.push(u),s+=e}return i.length===0?bo([],[0,t]):E(Et(i),[i.length,t])}var Tu=g({frame_:qE});function KE(r,t,e,o,n=Nu){o==null&&(o=Ug(t));let s=Tu(r,t,e),i=$(s,n(t));return Si(i,o)}var jg=g({stft_:KE});function XE(r,t,e,o,n="bilinear",s=0){let i=d(r,"image","cropAndResize"),a=d(t,"boxes","cropAndResize","float32"),u=d(e,"boxInd","cropAndResize","int32"),p=a.shape[0];w(i.rank===4,()=>`Error in cropAndResize: image must be rank 4,but got rank ${i.rank}.`),w(a.rank===2&&a.shape[1]===4,()=>`Error in cropAndResize: boxes must be have size [${p},4] but had shape ${a.shape}.`),w(u.rank===1&&u.shape[0]===p,()=>`Error in cropAndResize: boxInd must be have size [${p}] but had shape ${a.shape}.`),w(o.length===2,()=>`Error in cropAndResize: cropSize must be of length 2, but got length ${o.length}.`),w(o[0]>=1&&o[1]>=1,()=>`cropSize must be atleast [1,1], but was ${o}`),w(n==="bilinear"||n==="nearest",()=>`method must be bilinear or nearest, but was ${n}`);let l={image:i,boxes:a,boxInd:u},c={method:n,extrapolationValue:s,cropSize:o};return y.runKernel(Hi,l,c)}var Yg=g({cropAndResize_:XE});function jE(r){let t=d(r,"image","flipLeftRight","float32");w(t.rank===4,()=>`Error in flipLeftRight: image must be rank 4,but got rank ${t.rank}.`);let e={image:t};return y.runKernel(oa,e,{})}var Zg=g({flipLeftRight_:jE});function YE(r){let t=d(r,"image","grayscaleToRGB"),e=t.rank-1,o=t.shape[e];w(t.rank>=2,()=>`Error in grayscaleToRGB: images must be at least rank 2, but got rank ${t.rank}.`),w(o===1,()=>`Error in grayscaleToRGB: last dimension of a grayscale image should be size 1, but got size ${o}.`);let n=new Array(t.rank);return n.fill(1,0,e),n[e]=3,dr(t,n)}var Qg=g({grayscaleToRGB_:YE});function ZE(r){let t=d(r,"image","RGBToGrayscale"),e=t.rank-1,o=t.shape[e];w(t.rank>=2,()=>`Error in RGBToGrayscale: images must be at least rank 2, but got rank ${t.rank}.`),w(o===3,()=>`Error in RGBToGrayscale: last dimension of an RGB image should be size 3, but got size ${o}.`);let n=t.dtype,s=_(t,"float32"),i=Wt([.2989,.587,.114]),a;switch(t.rank){case 2:a=fo("ij,j->i",s,i);break;case 3:a=fo("ijk,k->ij",s,i);break;case 4:a=fo("ijkl,l->ijk",s,i);break;case 5:a=fo("ijklm,m->ijkl",s,i);break;case 6:a=fo("ijklmn,n->ijklm",s,i);break;default:throw new Error("Not a valid tensor rank.")}return a=Ae(a,-1),_(a,n)}var Jg=g({rgbToGrayscale_:ZE});function QE(r,t,e=0,o=.5){let n=d(r,"image","rotateWithOffset","float32");w(n.rank===4,()=>`Error in rotateWithOffset: image must be rank 4,but got rank ${n.rank}.`);let s={image:n},i={radians:t,fillValue:e,center:o};return y.runKernel(Oa,s,i)}var tx=g({rotateWithOffset_:QE});function Re(r,t,e,o,n,s){o==null&&(o=.5),n==null&&(n=Number.NEGATIVE_INFINITY),s==null&&(s=0);let i=r.shape[0];return e=Math.min(e,i),w(0<=o&&o<=1,()=>`iouThreshold must be in [0, 1], but was '${o}'`),w(r.rank===2,()=>`boxes must be a 2D tensor, but was of rank '${r.rank}'`),w(r.shape[1]===4,()=>`boxes must have 4 columns, but 2nd dimension was ${r.shape[1]}`),w(t.rank===1,()=>"scores must be a 1D tensor"),w(t.shape[0]===i,()=>`scores has incompatible shape with boxes. Expected ${i}, but was ${t.shape[0]}`),w(0<=s&&s<=1,()=>`softNmsSigma must be in [0, 1], but was '${s}'`),{maxOutputSize:e,iouThreshold:o,scoreThreshold:n,softNmsSigma:s}}function JE(r,t,e,o=.5,n=Number.NEGATIVE_INFINITY){let s=d(r,"boxes","nonMaxSuppression","float32"),i=d(t,"scores","nonMaxSuppression","float32"),a=Re(s,i,e,o,n);e=a.maxOutputSize,o=a.iouThreshold,n=a.scoreThreshold;let u={maxOutputSize:e,iouThreshold:o,scoreThreshold:n};return y.runKernel(wa,{boxes:s,scores:i},u)}var ex=g({nonMaxSuppression_:JE});function rx(r,t,e){let o=t$(r,t,e),n=o<0?-(o+1):o;r.splice(n,0,t)}function t$(r,t,e){return r$(r,t,e||e$)}function e$(r,t){return r>t?1:r<t?-1:0}function r$(r,t,e){let o=0,n=r.length,s=0,i=!1;for(;o<n;){s=o+(n-o>>>1);let a=e(t,r[s]);a>0?o=s+1:(n=s,i=!a)}return i?o:-o-1}function Du(r,t,e,o,n){return sm(r,t,e,o,n,0)}function Au(r,t,e,o,n,s){return sm(r,t,e,o,n,0,!1,s,!0)}function Ru(r,t,e,o,n,s){return sm(r,t,e,o,n,s,!0)}function sm(r,t,e,o,n,s,i=!1,a=!1,u=!1){let p=[];for(let x=0;x<t.length;x++)t[x]>n&&p.push({score:t[x],boxIndex:x,suppressBeginIndex:0});p.sort(ox);let l=s>0?-.5/s:0,c=[],m=[];for(;c.length<e&&p.length>0;){let x=p.pop(),{score:C,boxIndex:k,suppressBeginIndex:v}=x;if(C<n)break;let I=!1;for(let T=c.length-1;T>=v;--T){let R=o$(r,k,c[T]);if(R>=o){I=!0;break}if(x.score=x.score*n$(o,l,R),x.score<=n)break}x.suppressBeginIndex=c.length,I||(x.score===C?(c.push(k),m.push(x.score)):x.score>n&&rx(p,x,ox))}let f=c.length,h=e-f;a&&h>0&&(c.push(...new Array(h).fill(0)),m.push(...new Array(h).fill(0)));let b={selectedIndices:c};return i&&(b.selectedScores=m),u&&(b.validOutputs=f),b}function o$(r,t,e){let o=r.subarray(t*4,t*4+4),n=r.subarray(e*4,e*4+4),s=Math.min(o[0],o[2]),i=Math.min(o[1],o[3]),a=Math.max(o[0],o[2]),u=Math.max(o[1],o[3]),p=Math.min(n[0],n[2]),l=Math.min(n[1],n[3]),c=Math.max(n[0],n[2]),m=Math.max(n[1],n[3]),f=(a-s)*(u-i),h=(c-p)*(m-l);if(f<=0||h<=0)return 0;let b=Math.max(s,p),x=Math.max(i,l),C=Math.min(a,c),k=Math.min(u,m),v=Math.max(C-b,0)*Math.max(k-x,0);return v/(f+h-v)}function n$(r,t,e){let o=Math.exp(t*e*e);return e<=r?o:0}function ox(r,t){return r.score-t.score||r.score===t.score&&t.boxIndex-r.boxIndex}async function s$(r,t,e,o=.5,n=Number.NEGATIVE_INFINITY){let s=d(r,"boxes","nonMaxSuppressionAsync"),i=d(t,"scores","nonMaxSuppressionAsync"),a=Re(s,i,e,o,n);e=a.maxOutputSize,o=a.iouThreshold,n=a.scoreThreshold;let u=await Promise.all([s.data(),i.data()]),p=u[0],l=u[1],{selectedIndices:c}=Du(p,l,e,o,n);return s!==r&&s.dispose(),i!==t&&i.dispose(),Wt(c,"int32")}var nx=s$;function i$(r,t,e,o=.5,n=Number.NEGATIVE_INFINITY,s=0){let i=d(r,"boxes","nonMaxSuppression"),a=d(t,"scores","nonMaxSuppression"),u=Re(i,a,e,o,n,s);e=u.maxOutputSize,o=u.iouThreshold,n=u.scoreThreshold,s=u.softNmsSigma;let p={boxes:i,scores:a},l={maxOutputSize:e,iouThreshold:o,scoreThreshold:n,softNmsSigma:s},c=y.runKernel(Sa,p,l);return{selectedIndices:c[0],selectedScores:c[1]}}var sx=g({nonMaxSuppressionWithScore_:i$});async function a$(r,t,e,o=.5,n=Number.NEGATIVE_INFINITY,s=0){let i=d(r,"boxes","nonMaxSuppressionAsync"),a=d(t,"scores","nonMaxSuppressionAsync"),u=Re(i,a,e,o,n,s);e=u.maxOutputSize,o=u.iouThreshold,n=u.scoreThreshold,s=u.softNmsSigma;let p=await Promise.all([i.data(),a.data()]),l=p[0],c=p[1],{selectedIndices:m,selectedScores:f}=Ru(l,c,e,o,n,s);return i!==r&&i.dispose(),a!==t&&a.dispose(),{selectedIndices:Wt(m,"int32"),selectedScores:Wt(f)}}var ix=a$;function u$(r,t,e,o=.5,n=Number.NEGATIVE_INFINITY,s=!1){let i=d(r,"boxes","nonMaxSuppression"),a=d(t,"scores","nonMaxSuppression"),u=Re(i,a,e,o,n,null),p=u.maxOutputSize,l=u.iouThreshold,c=u.scoreThreshold,m={boxes:i,scores:a},f={maxOutputSize:p,iouThreshold:l,scoreThreshold:c,padToMaxOutputSize:s},h=y.runKernel(sf,m,f);return{selectedIndices:h[0],validOutputs:h[1]}}var ax=g({nonMaxSuppressionPadded_:u$});async function p$(r,t,e,o=.5,n=Number.NEGATIVE_INFINITY,s=!1){let i=d(r,"boxes","nonMaxSuppressionAsync"),a=d(t,"scores","nonMaxSuppressionAsync"),u=Re(i,a,e,o,n,null),p=u.maxOutputSize,l=u.iouThreshold,c=u.scoreThreshold,[m,f]=await Promise.all([i.data(),a.data()]),{selectedIndices:h,validOutputs:b}=Au(m,f,p,l,c,s);return i!==r&&i.dispose(),a!==t&&a.dispose(),{selectedIndices:Wt(h,"int32"),validOutputs:X(b,"int32")}}var ux=p$;function l$(r,t,e=!1,o=!1){let n=d(r,"images","resizeBilinear");w(n.rank===3||n.rank===4,()=>`Error in resizeBilinear: x must be rank 3 or 4, but got rank ${n.rank}.`),w(t.length===2,()=>`Error in resizeBilinear: new shape must 2D, but got shape ${t}.`),w(o===!1||e===!1,()=>"Error in resizeBilinear: If halfPixelCenters is true, alignCorners must be false.");let s=n,i=!1;n.rank===3&&(i=!0,s=E(n,[1,n.shape[0],n.shape[1],n.shape[2]]));let[]=t,a={images:s},u={alignCorners:e,halfPixelCenters:o,size:t},p=y.runKernel(Bn,a,u);return i?E(p,[p.shape[1],p.shape[2],p.shape[3]]):p}var px=g({resizeBilinear_:l$});function c$(r,t,e=!1,o=!1){let n=d(r,"images","resizeNearestNeighbor");w(n.rank===3||n.rank===4,()=>`Error in resizeNearestNeighbor: x must be rank 3 or 4, but got rank ${n.rank}.`),w(t.length===2,()=>`Error in resizeNearestNeighbor: new shape must 2D, but got shape ${t}.`),w(n.dtype==="float32"||n.dtype==="int32",()=>"`images` must have `int32` or `float32` as dtype"),w(o===!1||e===!1,()=>"Error in resizeNearestNeighbor: If halfPixelCenters is true, alignCorners must be false.");let s=n,i=!1;n.rank===3&&(i=!0,s=E(n,[1,n.shape[0],n.shape[1],n.shape[2]]));let[]=t,a={images:s},u={alignCorners:e,halfPixelCenters:o,size:t},p=y.runKernel(_n,a,u);return i?E(p,[p.shape[1],p.shape[2],p.shape[3]]):p}var lx=g({resizeNearestNeighbor_:c$});function m$(r,t="binary",e=!1,o=.5){let n=d(r,"image","threshold"),s=.2989,i=.587,a=.114,u=n.shape[0]*n.shape[1],p=$(Wt([o]),255),l,c,m,f;if(w(n.rank===3,()=>`Error in threshold: image must be rank 3,but got rank ${n.rank}.`),w(n.shape[2]===3||n.shape[2]===1,()=>`Error in threshold: image color channel must be equal to 3 or 1but got ${n.shape[2]}.`),w(n.dtype==="int32"||n.dtype==="float32",()=>`Error in dtype: image dtype must be int32 or float32,but got dtype ${n.dtype}.`),w(t==="otsu"||t==="binary",()=>`Method must be binary or otsu, but was ${t}`),n.shape[2]===3){[l,c,m]=Qe(n,[1,1,1],-1);let x=$(l,s),C=$(c,i),k=$(m,a);f=O(O(x,C),k)}else f=r;if(t==="otsu"){let x=Fc(_(em(f),"int32"),hr([]),256);p=f$(x,u)}let h=e?Ge(f,p):Zt(f,p);return _($(h,255),"int32")}function f$(r,t){let e=Wt([-1]),o=Wt([0]),n=Wt([0]),s,i,a,u,p,l;for(let c=0;c<r.size-1;c++){s=at(r,0,c+1),i=at(r,c+1),p=V(K(s),t),l=V(K(i),t);let m=K($(s,xo(0,s.size)));a=V(m,K(s));let f=yr(i.shape,s.size),h=O(xo(0,i.size),f),b=$(i,h);u=V(K(b),K(i));let x=U(a,u),C=U(a,u),k=$(p,l);n=$($(k,x),C);let v=Zt(n,o);o=It(v,n,o),e=It(v,Wt([c]),e)}return e}var cx=g({threshold_:m$});function d$(r,t,e="nearest",o="constant",n=0,s){let i=d(r,"image","transform","float32"),a=d(t,"transforms","transform","float32");w(i.rank===4,()=>`Error in transform: image must be rank 4,but got rank ${i.rank}.`),w(a.rank===2&&(a.shape[0]===i.shape[0]||a.shape[0]===1)&&a.shape[1]===8,()=>"Error in transform: Input transform should be batch x 8 or 1 x 8"),w(s==null||s.length===2,()=>`Error in transform: outputShape must be [height, width] or null, but got ${s}.`);let u={image:i,transforms:a},p={interpolation:e,fillMode:o,fillValue:n,outputShape:s};return y.runKernel(Ga,u,p)}var mx=g({transform_:d$});function h$(r,t,e){let o=d(r,"a","bandPart");w(o.rank>=2,()=>`bandPart(): Rank must be at least 2, got ${o.rank}.`);let n=o.shape,[s,i]=o.shape.slice(-2),a,u;typeof t=="number"?(w(t%1===0,()=>`bandPart(): numLower must be an integer, got ${t}.`),w(t<=s,()=>`bandPart(): numLower (${t}) must not be greater than the number of rows (${s}).`),a=d(t<0?s:t,"numLower","bandPart")):(w(t.dtype==="int32",()=>"bandPart(): numLower's dtype must be an int32."),a=It(hs(t,0),s,vs(t,s))),typeof e=="number"?(w(e%1===0,()=>`bandPart(): numUpper must be an integer, got ${e}.`),w(e<=i,()=>`bandPart(): numUpper (${e}) must not be greater than the number of columns (${i}).`),u=d(e<0?i:e,"numUpper","bandPart")):(w(e.dtype==="int32",()=>"bandPart(): numUpper's dtype must be an int32."),u=It(hs(e,0),i,vs(e,i)));let p=E(xo(0,s,1,"int32"),[-1,1]),l=xo(0,i,1,"int32"),c=U(p,l),m=Ze(Ge(c,a),mr(c,lt(u))),f=ye([s,i],o.dtype);return E(Te(po(E(o,[-1,s,i])).map(h=>It(m,h,f))),n)}var fx=g({bandPart_:h$});function g$(r){let t;if(Array.isArray(r)){t=!1,w(r!=null&&r.length>0,()=>"Gram-Schmidt process: input must not be null, undefined, or empty");let n=r[0].shape[0];for(let s=1;s<r.length;++s)w(r[s].shape[0]===n,()=>`Gram-Schmidt: Non-unique lengths found in the input vectors: (${r[s].shape[0]} vs. ${n})`)}else t=!0,r=Qe(r,r.shape[0],0).map(n=>Ci(n,[0]));w(r.length<=r[0].shape[0],()=>`Gram-Schmidt: Number of vectors (${r.length}) exceeds number of dimensions (${r[0].shape[0]}).`);let e=[],o=r;for(let n=0;n<r.length;++n)e.push(y.tidy(()=>{let s=o[n];if(n>0)for(let i=0;i<n;++i){let a=$(K($(e[i],s)),e[i]);s=U(s,a)}return V(s,Ss(s,"euclidean"))}));return t?Te(e,0):e}var dx=g({gramSchmidt_:g$});function x$(r,t=!1){if(w(r.rank>=2,()=>`qr() requires input tensor to have a rank >= 2, but got rank ${r.rank}`),r.rank===2)return hx(r,t);{let e=r.shape.slice(0,r.shape.length-2).reduce((u,p)=>u*p),o=po(E(r,[e,r.shape[r.shape.length-2],r.shape[r.shape.length-1]]),0),n=[],s=[];o.forEach(u=>{let[p,l]=hx(u,t);n.push(p),s.push(l)});let i=E(Te(n,0),r.shape),a=E(Te(s,0),r.shape);return[i,a]}}function hx(r,t=!1){return y.tidy(()=>{w(r.shape.length===2,()=>`qr2d() requires a 2D Tensor, but got a ${r.shape.length}D Tensor.`);let e=r.shape[0],o=r.shape[1],n=_c(e),s=Oe(r),i=bo([[1]],[1,1]),a=Oe(i),u=e>=o?o:e;for(let p=0;p<u;++p){let l=s,c=a,m=n;[a,s,n]=y.tidy(()=>{let f=at(s,[p,p],[e-p,1]),h=Ss(f),b=at(s,[p,p],[1,1]),x=It(Zt(b,0),bo([[-1]]),bo([[1]])),C=U(b,$(x,h)),k=V(f,C);k.shape[0]===1?a=Oe(i):a=Et([i,at(k,[1,0],[k.shape[0]-1,k.shape[1]])],0);let v=lt(V(nt(x,C),h)),I=at(s,[p,0],[e-p,o]),T=$(v,a),R=te(a);if(p===0)s=U(I,nt(T,nt(R,I)));else{let B=U(I,nt(T,nt(R,I)));s=Et([at(s,[0,0],[p,o]),B],0)}let M=te(T),z=at(n,[0,p],[e,n.shape[1]-p]);if(p===0)n=U(z,nt(nt(z,a),M));else{let B=U(z,nt(nt(z,a),M));n=Et([at(n,[0,0],[e,p]),B],1)}return[a,s,n]}),Ft([l,c,m])}return!t&&e>o&&(n=at(n,[0,0],[e,o]),s=at(s,[0,0],[o,o])),[n,s]})}var gx=g({qr_:x$});var $t;(function(r){r[r.NONE=0]="NONE",r[r.MEAN=1]="MEAN",r[r.SUM=2]="SUM",r[r.SUM_BY_NONZERO_WEIGHTS=3]="SUM_BY_NONZERO_WEIGHTS"})($t||($t={}));function y$(r,t,e=$t.SUM_BY_NONZERO_WEIGHTS){let o=d(r,"losses","computeWeightedLoss"),n=null;t!=null&&(n=d(t,"weights","computeWeightedLoss"));let s=n==null?o:$(o,n);if(e===$t.NONE)return s;if(e===$t.SUM)return K(s);if(e===$t.MEAN){if(n==null)return Cs(s);{let i=o.size/n.size,a=V(K(s),K(n));return i>1?V(a,X(i)):a}}if(e===$t.SUM_BY_NONZERO_WEIGHTS){if(n==null)return V(K(s),X(o.size));{let i=$(n,ee(o.shape)),a=_(K(Vc(i,X(0))),"float32");return V(K(s),a)}}throw Error(`Unknown reduction: ${e}`)}var Ut=g({computeWeightedLoss_:y$});function b$(r,t,e,o=$t.SUM_BY_NONZERO_WEIGHTS){let n=d(r,"labels","absoluteDifference"),s=d(t,"predictions","absoluteDifference"),i=null;e!=null&&(i=d(e,"weights","absoluteDifference")),yt(n.shape,s.shape,"Error in absoluteDifference: ");let a=Ot(U(n,s));return Ut(a,i,o)}var xx=g({absoluteDifference_:b$});function w$(r,t,e,o,n=$t.SUM_BY_NONZERO_WEIGHTS){let s=d(r,"labels","cosineDistance"),i=d(t,"predictions","cosineDistance"),a=null;o!=null&&(a=d(o,"weights","cosineDistance")),yt(s.shape,i.shape,"Error in cosineDistance: ");let u=X(1),p=U(u,K($(s,i),e,!0));return Ut(p,a,n)}var yx=g({cosineDistance_:w$});function S$(r,t,e,o=$t.SUM_BY_NONZERO_WEIGHTS){let n=d(r,"labels","hingeLoss"),s=d(t,"predictions","hingeLoss"),i=null;e!=null&&(i=d(e,"weights","hingeLoss")),yt(n.shape,s.shape,"Error in hingeLoss: ");let a=X(1);n=U($(X(2),n),a);let u=yo(U(a,$(n,s)));return Ut(u,i,o)}var bx=g({hingeLoss_:S$});function C$(r,t,e,o=1,n=$t.SUM_BY_NONZERO_WEIGHTS){let s=d(r,"labels","huberLoss"),i=d(t,"predictions","huberLoss"),a=null;e!=null&&(a=d(e,"weights","huberLoss")),yt(s.shape,i.shape,"Error in huberLoss: ");let u=X(o),p=Ot(U(i,s)),l=vs(p,u),c=U(p,l),m=O($(X(.5),tt(l)),$(u,c));return Ut(m,a,n)}var wx=g({huberLoss_:C$});function v$(r,t,e,o=1e-7,n=$t.SUM_BY_NONZERO_WEIGHTS){let s=d(r,"labels","logLoss"),i=d(t,"predictions","logLoss"),a=null;e!=null&&(a=d(e,"weights","logLoss")),yt(s.shape,i.shape,"Error in logLoss: ");let u=X(1),p=X(o),l=lt($(s,Je(O(i,p)))),c=$(U(u,s),Je(O(U(u,i),p))),m=U(l,c);return Ut(m,a,n)}var Sx=g({logLoss_:v$});function k$(r,t,e,o=$t.SUM_BY_NONZERO_WEIGHTS){let n=d(r,"labels","meanSquaredError"),s=d(t,"predictions","meanSquaredError"),i=null;e!=null&&(i=d(e,"weights","meanSquaredError")),yt(n.shape,s.shape,"Error in meanSquaredError: ");let a=om(n,s);return Ut(a,i,o)}var Cx=g({meanSquaredError_:k$});function I$(r,t){let e=d(r,"labels","sigmoidCrossEntropyWithLogits"),o=d(t,"logits","sigmoidCrossEntropyWithLogits");yt(e.shape,o.shape,"Error in sigmoidCrossEntropyWithLogits: ");let n=yo(o),s=$(o,e),i=zc(zt(lt(Ot(o))));return O(U(n,s),i)}function E$(r,t,e,o=0,n=$t.SUM_BY_NONZERO_WEIGHTS){let s=d(r,"multiClassLabels","sigmoidCrossEntropy"),i=d(t,"logits","sigmoidCrossEntropy"),a=null;if(e!=null&&(a=d(e,"weights","sigmoidCrossEntropy")),yt(s.shape,i.shape,"Error in sigmoidCrossEntropy: "),o>0){let p=X(o),l=X(1),c=X(.5);s=O($(s,U(l,p)),$(c,p))}let u=I$(s,i);return Ut(u,a,n)}var vx=g({sigmoidCrossEntropy_:E$});function $$(r,t,e=-1){if(e===-1&&(e=t.rank-1),e!==t.rank-1)throw Error(`Softmax cross entropy along a non-last dimension is not yet supported. Labels / logits was rank ${t.rank} and dim was ${e}`);return Qt((n,s,i)=>{let u=Oc(s,[e],!0),p=U(_(s,"float32"),u);i([n,p]);let l=lt($(p,n));return{value:K(l,[e]),gradFunc:(f,h)=>{let[b,x]=h,C=Ne(f.shape,[e]);return[$(E(f,C),U(_(b,"float32"),zt(x))),$(E(f,C),U(zt(x),_(b,"float32")))]}}})(r,t)}function N$(r,t,e,o=0,n=$t.SUM_BY_NONZERO_WEIGHTS){let s=d(r,"onehotLabels","softmaxCrossEntropy"),i=d(t,"logits","softmaxCrossEntropy"),a=null;if(e!=null&&(a=d(e,"weights","softmaxCrossEntropy")),yt(s.shape,i.shape,"Error in softmaxCrossEntropy: "),o>0){let p=X(o),l=X(1),c=X(s.shape[1]);s=O($(s,U(l,p)),V(p,c))}let u=$$(s,i);return Ut(u,a,n)}var kx=g({softmaxCrossEntropy_:N$});function T$(r,t,e,o){let n=d(r,"indices","sparseFillEmptyRows","int32"),s=d(t,"values","sparseFillEmptyRows"),i=d(e,"denseShape","sparseFillEmptyRows","int32"),a=d(o,"defaultValue","sparseFillEmptyRows",s.dtype);if(n.rank!==2)throw new Error(`Indices should be Tensor2D but received shape
        ${n.shape}`);if(s.rank!==1)throw new Error(`Values should be Tensor1D but received shape ${s.shape}`);if(i.rank!==1)throw new Error(`Dense shape should be Tensor1D but received shape ${i.shape}`);if(a.rank!==0)throw new Error(`Default value should be a scalar but received shape ${a.shape}`);let u={indices:n,values:s,denseShape:i,defaultValue:a},p=y.runKernel(lf,u);return{outputIndices:p[0],outputValues:p[1],emptyRowIndicator:p[2],reverseIndexMap:p[3]}}var Ix=g({sparseFillEmptyRows_:T$});function D$(r,t,e){let o=d(r,"inputIndices","sparseReshape","int32"),n=d(t,"inputShape","sparseReshape","int32"),s=d(e,"newShape","sparseReshape","int32");if(o.rank!==2)throw new Error(`Input indices should be Tensor2D but received shape
        ${o.shape}`);if(n.rank!==1)throw new Error(`Input shape should be Tensor1D but received shape ${n.shape}`);if(s.rank!==1)throw new Error(`New shape should be Tensor1D but received shape ${s.shape}`);let i={inputIndices:o,inputShape:n,newShape:s},a=y.runKernel(cf,i);return{outputIndices:a[0],outputShape:a[1]}}var Ex=g({sparseReshape_:D$});function A$(r,t,e){let o=d(r,"data","sparseSegmentMean"),n=d(t,"indices","sparseSegmentMean","int32"),s=d(e,"segmentIds","sparseSegmentMean","int32");if(o.rank<1)throw new Error("Data should be at least 1 dimensional but received scalar");if(n.rank!==1)throw new Error(`Indices should be Tensor1D but received shape
          ${n.shape}`);if(s.rank!==1)throw new Error(`Segment ids should be Tensor1D but received shape
          ${s.shape}`);let i={data:o,indices:n,segmentIds:s};return y.runKernel(Aa,i)}var $x=g({sparseSegmentMean_:A$});function R$(r,t,e){let o=d(r,"data","sparseSegmentSum"),n=d(t,"indices","sparseSegmentSum","int32"),s=d(e,"segmentIds","sparseSegmentSum","int32");if(o.rank<1)throw new Error("Data should be at least 1 dimensional but received scalar");if(n.rank!==1)throw new Error(`Indices should be Tensor1D but received shape
         ${n.shape}`);if(s.rank!==1)throw new Error(`Segment ids should be Tensor1D but received shape
         ${s.shape}`);let i={data:o,indices:n,segmentIds:s};return y.runKernel(Ra,i)}var Nx=g({sparseSegmentSum_:R$});function F$(r,t,e,o,n,s,i,a){let u=d(r,"data","stringNGrams","string");if(u.dtype!=="string")throw new Error("Data must be of datatype string");if(u.shape.length!==1)throw new Error(`Data must be a vector, saw: ${u.shape}`);let p=d(t,"dataSplits","stringNGrams");if(p.dtype!=="int32")throw new Error("Data splits must be of datatype int32");let l={separator:e,nGramWidths:o,leftPad:n,rightPad:s,padWidth:i,preserveShortSequences:a},c={data:u,dataSplits:p},m=y.runKernel(Ba,c,l);return{nGrams:m[0],nGramsSplits:m[1]}}var Tx=g({stringNGrams_:F$});function P$(r,t,e=!0){let o=d(r,"input","stringSplit","string"),n=d(t,"delimiter","stringSplit","string");if(o.rank!==1)throw new Error(`Input should be Tensor1D but received shape ${o.shape}`);if(n.rank!==0)throw new Error(`Delimiter should be a scalar but received shape ${n.shape}`);let s={skipEmpty:e},i={input:o,delimiter:n},a=y.runKernel(mf,i,s);return{indices:a[0],values:a[1],shape:a[2]}}var Dx=g({stringSplit_:P$});function M$(r,t){let e=d(r,"input","stringToHashBucketFast","string"),o={numBuckets:t};if(t<=0)throw new Error("Number of buckets must be at least 1");let n={input:e};return y.runKernel(ff,n,o)}var Ax=g({stringToHashBucketFast_:M$});function _$(r,t,e,o=!0){let n=d(r,"input","staticRegexReplace","string"),s={pattern:t,rewrite:e,replaceGlobal:o};return y.runKernel(Ma,{x:n},s)}var Rx=g({staticRegexReplace_:_$});var Ult={fft:wi,ifft:ks,rfft:Si,irfft:rm},Xlt={hammingWindow:Xg,hannWindow:Nu,frame:Tu,stft:jg},lct={flipLeftRight:Zg,grayscaleToRGB:Qg,resizeNearestNeighbor:lx,resizeBilinear:px,rgbToGrayscale:Jg,rotateWithOffset:tx,cropAndResize:Yg,nonMaxSuppression:ex,nonMaxSuppressionAsync:nx,nonMaxSuppressionWithScore:sx,nonMaxSuppressionWithScoreAsync:ix,nonMaxSuppressionPadded:ax,nonMaxSuppressionPaddedAsync:ux,threshold:cx,transform:mx},dct={bandPart:fx,gramSchmidt:dx,qr:gx},kct={absoluteDifference:xx,computeWeightedLoss:Ut,cosineDistance:yx,hingeLoss:bx,huberLoss:wx,logLoss:Sx,meanSquaredError:Cx,sigmoidCrossEntropy:vx,softmaxCrossEntropy:kx},Tct={sparseFillEmptyRows:Ix,sparseReshape:Ex,sparseSegmentMean:$x,sparseSegmentSum:Nx},Pct={stringNGrams:Tx,stringSplit:Dx,stringToHashBucketFast:Ax,staticRegexReplace:Rx};var Jt=class extends mi{minimize(t,e=!1,o){let{value:n,grads:s}=this.computeGradients(t,o);if(o!=null){let i=o.map(a=>({name:a.name,tensor:s[a.name]}));this.applyGradients(i)}else this.applyGradients(s);return Ft(s),e?n:(n.dispose(),null)}get iterations(){return this.iterations_==null&&(this.iterations_=0),this.iterations_}incrementIterations(){this.iterations_=this.iterations+1}computeGradients(t,e){return Lc(t,e)}dispose(){this.iterations_!=null&&Ft(this.iterations_)}async saveIterations(){return this.iterations_==null&&(this.iterations_=0),{name:"iter",tensor:X(this.iterations_,"int32")}}async getWeights(){throw new Error("getWeights() is not implemented for this optimizer yet.")}async setWeights(t){throw new Error(`setWeights() is not implemented for this optimizer class ${this.getClassName()}`)}async extractIterations(t){return this.iterations_=(await t[0].tensor.data())[0],t.slice(1)}};Object.defineProperty(Jt,Symbol.hasInstance,{value:r=>r.minimize!=null&&r.computeGradients!=null&&r.applyGradients!=null});var ko=class extends Jt{static get className(){return"Adadelta"}constructor(t,e,o=null){super(),this.learningRate=t,this.rho=e,this.epsilon=o,this.accumulatedGrads=[],this.accumulatedUpdates=[],o==null&&(this.epsilon=y.backend.epsilon())}applyGradients(t){(Array.isArray(t)?t.map(o=>o.name):Object.keys(t)).forEach((o,n)=>{let s=y.registeredVariables[o],i=!1;this.accumulatedGrads[n]==null&&(this.accumulatedGrads[n]={originalName:`${o}/accum_grad`,variable:dt(()=>Z(s).variable(i))}),this.accumulatedUpdates[n]==null&&(this.accumulatedUpdates[n]={originalName:`${o}/accum_var`,variable:dt(()=>Z(s).variable(i))});let a=Array.isArray(t)?t[n].tensor:t[o];if(a==null)return;let u=this.accumulatedGrads[n].variable,p=this.accumulatedUpdates[n].variable;dt(()=>{let l=O($(u,this.rho),$(tt(a),1-this.rho)),c=$(V(At(O(p,this.epsilon)),At(O(u,this.epsilon))),a),m=O($(p,this.rho),$(tt(c),1-this.rho));u.assign(l),p.assign(m);let f=O($(c,-this.learningRate),s);s.assign(f)})}),this.incrementIterations()}dispose(){this.accumulatedUpdates!=null&&(Ft(this.accumulatedGrads.map(t=>t.variable)),Ft(this.accumulatedUpdates.map(t=>t.variable)))}async getWeights(){let t=[...this.accumulatedGrads,...this.accumulatedUpdates];return[await this.saveIterations()].concat(t.map(e=>({name:e.originalName,tensor:e.variable})))}async setWeights(t){t=await this.extractIterations(t);let e=t.length/2,o=!1;this.accumulatedGrads=t.slice(0,e).map(n=>({originalName:n.name,variable:n.tensor.variable(o)})),this.accumulatedUpdates=t.slice(e,e*2).map(n=>({originalName:n.name,variable:n.tensor.variable(o)}))}getConfig(){return{learningRate:this.learningRate,rho:this.rho,epsilon:this.epsilon}}static fromConfig(t,e){return new t(e.learningRate,e.rho,e.epsilon)}};var Io=class extends Jt{static get className(){return"Adagrad"}constructor(t,e=.1){super(),this.learningRate=t,this.initialAccumulatorValue=e,this.accumulatedGrads=[]}applyGradients(t){(Array.isArray(t)?t.map(o=>o.name):Object.keys(t)).forEach((o,n)=>{let s=y.registeredVariables[o];this.accumulatedGrads[n]==null&&(this.accumulatedGrads[n]={originalName:`${o}/accumulator`,variable:dt(()=>yr(s.shape,this.initialAccumulatorValue).variable(!1))});let i=Array.isArray(t)?t[n].tensor:t[o];if(i==null)return;let a=this.accumulatedGrads[n].variable;dt(()=>{let u=O(a,tt(i));a.assign(u);let p=O($(V(i,At(O(u,y.backend.epsilon()))),-this.learningRate),s);s.assign(p)})}),this.incrementIterations()}dispose(){this.accumulatedGrads!=null&&Ft(this.accumulatedGrads.map(t=>t.variable))}async getWeights(){return[await this.saveIterations()].concat(this.accumulatedGrads.map(t=>({name:t.originalName,tensor:t.variable})))}async setWeights(t){t=await this.extractIterations(t);let e=!1;this.accumulatedGrads=t.map(o=>({originalName:o.name,variable:o.tensor.variable(e)}))}getConfig(){return{learningRate:this.learningRate,initialAccumulatorValue:this.initialAccumulatorValue}}static fromConfig(t,e){return new t(e.learningRate,e.initialAccumulatorValue)}};var Eo=class extends Jt{static get className(){return"Adam"}constructor(t,e,o,n=null){super(),this.learningRate=t,this.beta1=e,this.beta2=o,this.epsilon=n,this.accumulatedFirstMoment=[],this.accumulatedSecondMoment=[],dt(()=>{this.accBeta1=X(e).variable(),this.accBeta2=X(o).variable()}),n==null&&(this.epsilon=y.backend.epsilon())}applyGradients(t){let e=Array.isArray(t)?t.map(o=>o.name):Object.keys(t);dt(()=>{let o=U(1,this.accBeta1),n=U(1,this.accBeta2);e.forEach((s,i)=>{let a=y.registeredVariables[s],u=!1;this.accumulatedFirstMoment[i]==null&&(this.accumulatedFirstMoment[i]={originalName:`${s}/m`,variable:dt(()=>Z(a).variable(u))}),this.accumulatedSecondMoment[i]==null&&(this.accumulatedSecondMoment[i]={originalName:`${s}/v`,variable:dt(()=>Z(a).variable(u))});let p=Array.isArray(t)?t[i].tensor:t[s];if(p==null)return;let l=this.accumulatedFirstMoment[i].variable,c=this.accumulatedSecondMoment[i].variable,m=O($(l,this.beta1),$(p,1-this.beta1)),f=O($(c,this.beta2),$(tt(p),1-this.beta2)),h=V(m,o),b=V(f,n);l.assign(m),c.assign(f);let x=O($(V(h,O(At(b),this.epsilon)),-this.learningRate),a);a.assign(x)}),this.accBeta1.assign($(this.accBeta1,this.beta1)),this.accBeta2.assign($(this.accBeta2,this.beta2))}),this.incrementIterations()}dispose(){this.accBeta1.dispose(),this.accBeta2.dispose(),this.accumulatedFirstMoment!=null&&Ft(this.accumulatedFirstMoment.map(t=>t.variable)),this.accumulatedSecondMoment!=null&&Ft(this.accumulatedSecondMoment.map(t=>t.variable))}async getWeights(){let t=[...this.accumulatedFirstMoment,...this.accumulatedSecondMoment];return[await this.saveIterations()].concat(t.map(e=>({name:e.originalName,tensor:e.variable})))}async setWeights(t){t=await this.extractIterations(t),dt(()=>{this.accBeta1.assign(De(this.beta1,this.iterations_+1)),this.accBeta2.assign(De(this.beta2,this.iterations_+1))});let e=t.length/2,o=!1;this.accumulatedFirstMoment=t.slice(0,e).map(n=>({originalName:n.name,variable:n.tensor.variable(o)})),this.accumulatedSecondMoment=t.slice(e,e*2).map(n=>({originalName:n.name,variable:n.tensor.variable(o)}))}getConfig(){return{learningRate:this.learningRate,beta1:this.beta1,beta2:this.beta2,epsilon:this.epsilon}}static fromConfig(t,e){return new t(e.learningRate,e.beta1,e.beta2,e.epsilon)}};var $o=class extends Jt{static get className(){return"Adamax"}constructor(t,e,o,n=null,s=0){super(),this.learningRate=t,this.beta1=e,this.beta2=o,this.epsilon=n,this.decay=s,this.accumulatedFirstMoment=[],this.accumulatedWeightedInfNorm=[],dt(()=>{this.iteration=X(0).variable(),this.accBeta1=X(e).variable()}),n==null&&(this.epsilon=y.backend.epsilon())}applyGradients(t){let e=Array.isArray(t)?t.map(o=>o.name):Object.keys(t);dt(()=>{let o=U(1,this.accBeta1),n=V(-this.learningRate,O($(this.iteration,this.decay),1));e.forEach((s,i)=>{let a=y.registeredVariables[s],u=!1;this.accumulatedFirstMoment[i]==null&&(this.accumulatedFirstMoment[i]={originalName:`${s}/m`,variable:Z(a).variable(u)}),this.accumulatedWeightedInfNorm[i]==null&&(this.accumulatedWeightedInfNorm[i]={originalName:`${s}/v`,variable:Z(a).variable(u)});let p=Array.isArray(t)?t[i].tensor:t[s];if(p==null)return;let l=this.accumulatedFirstMoment[i].variable,c=this.accumulatedWeightedInfNorm[i].variable,m=O($(l,this.beta1),$(p,1-this.beta1)),f=$(c,this.beta2),h=Ot(p),b=yi(f,h);l.assign(m),c.assign(b);let x=O($(V(n,o),V(m,O(b,this.epsilon))),a);a.assign(x)}),this.iteration.assign(O(this.iteration,1)),this.accBeta1.assign($(this.accBeta1,this.beta1))}),this.incrementIterations()}dispose(){this.accBeta1.dispose(),this.iteration.dispose(),this.accumulatedFirstMoment!=null&&Ft(this.accumulatedFirstMoment.map(t=>t.variable)),this.accumulatedWeightedInfNorm!=null&&Ft(this.accumulatedWeightedInfNorm.map(t=>t.variable))}async getWeights(){throw new Error("getWeights() is not implemented for Adamax yet.")}async setWeights(t){throw new Error("setWeights() is not implemented for Adamax yet.")}getConfig(){return{learningRate:this.learningRate,beta1:this.beta1,beta2:this.beta2,epsilon:this.epsilon,decay:this.decay}}static fromConfig(t,e){return new t(e.learningRate,e.beta1,e.beta2,e.epsilon,e.decay)}};var wr=class extends Jt{static get className(){return"SGD"}constructor(t){super(),this.learningRate=t,this.setLearningRate(t)}applyGradients(t){(Array.isArray(t)?t.map(o=>o.name):Object.keys(t)).forEach((o,n)=>{let s=Array.isArray(t)?t[n].tensor:t[o];if(s==null)return;let i=y.registeredVariables[o];dt(()=>{let a=O($(this.c,s),i);i.assign(a)})}),this.incrementIterations()}setLearningRate(t){this.learningRate=t,this.c!=null&&this.c.dispose(),this.c=Td(X(-t))}dispose(){this.c.dispose()}async getWeights(){return[await this.saveIterations()]}async setWeights(t){if(t=await this.extractIterations(t),t.length!==0)throw new Error("SGD optimizer does not have settable weights.")}getConfig(){return{learningRate:this.learningRate}}static fromConfig(t,e){return new t(e.learningRate)}};var No=class extends wr{static get className(){return"Momentum"}constructor(t,e,o=!1){super(t),this.learningRate=t,this.momentum=e,this.useNesterov=o,this.accumulations=[],this.m=X(this.momentum)}applyGradients(t){(Array.isArray(t)?t.map(o=>o.name):Object.keys(t)).forEach((o,n)=>{let s=y.registeredVariables[o];this.accumulations[n]==null&&(this.accumulations[n]={originalName:`${o}/momentum`,variable:dt(()=>Z(s).variable(!1))});let i=this.accumulations[n].variable,a=Array.isArray(t)?t[n].tensor:t[o];a!=null&&dt(()=>{let u,p=O($(this.m,i),a);this.useNesterov?u=O($(this.c,O(a,$(p,this.m))),s):u=O($(this.c,p),s),i.assign(p),s.assign(u)})}),this.incrementIterations()}dispose(){this.m.dispose(),this.accumulations!=null&&Ft(this.accumulations.map(t=>t.variable))}setMomentum(t){this.momentum=t}async getWeights(){return[await this.saveIterations()].concat(this.accumulations.map(t=>({name:t.originalName,tensor:t.variable})))}async setWeights(t){t=await this.extractIterations(t);let e=!1;this.accumulations=t.map(o=>({originalName:o.name,variable:o.tensor.variable(e)}))}getConfig(){return{learningRate:this.learningRate,momentum:this.momentum,useNesterov:this.useNesterov}}static fromConfig(t,e){return new t(e.learningRate,e.momentum,e.useNesterov)}};var To=class extends Jt{static get className(){return"RMSProp"}constructor(t,e=.9,o=0,n=null,s=!1){if(super(),this.learningRate=t,this.decay=e,this.momentum=o,this.epsilon=n,this.accumulatedMeanSquares=[],this.accumulatedMoments=[],this.accumulatedMeanGrads=[],this.centered=s,n==null&&(this.epsilon=y.backend.epsilon()),t==null)throw new Error("learningRate for RMSPropOptimizer must be defined.")}applyGradients(t){(Array.isArray(t)?t.map(o=>o.name):Object.keys(t)).forEach((o,n)=>{let s=y.registeredVariables[o],i=!1;this.accumulatedMeanSquares[n]==null&&(this.accumulatedMeanSquares[n]={originalName:`${o}/rms`,variable:dt(()=>Z(s).variable(i))}),this.accumulatedMoments[n]==null&&(this.accumulatedMoments[n]={originalName:`${o}/momentum`,variable:dt(()=>Z(s).variable(i))}),this.accumulatedMeanGrads[n]==null&&this.centered&&(this.accumulatedMeanGrads[n]={originalName:`${o}/mg`,variable:dt(()=>Z(s).variable(i))});let a=Array.isArray(t)?t[n].tensor:t[o];if(a==null)return;let u=this.accumulatedMeanSquares[n].variable,p=this.accumulatedMoments[n].variable;dt(()=>{let l=O($(u,this.decay),$(tt(a),1-this.decay));if(this.centered){let c=this.accumulatedMeanGrads[n].variable,m=O($(c,this.decay),$(a,1-this.decay)),f=V($(a,this.learningRate),At(U(l,O(tt(m),this.epsilon)))),h=O($(p,this.momentum),f);u.assign(l),c.assign(m),p.assign(h);let b=U(s,h);s.assign(b)}else{let c=O($(u,this.decay),$(tt(a),1-this.decay)),m=O($(p,this.momentum),V($(a,this.learningRate),At(O(c,this.epsilon))));u.assign(c),p.assign(m);let f=U(s,m);s.assign(f)}})}),this.incrementIterations()}dispose(){this.accumulatedMeanSquares!=null&&Ft(this.accumulatedMeanSquares.map(t=>t.variable)),this.accumulatedMeanGrads!=null&&this.centered&&Ft(this.accumulatedMeanGrads.map(t=>t.variable)),this.accumulatedMoments!=null&&Ft(this.accumulatedMoments.map(t=>t.variable))}async getWeights(){let t=[...this.accumulatedMeanSquares,...this.accumulatedMoments];return this.centered&&t.push(...this.accumulatedMeanGrads),[await this.saveIterations()].concat(t.map(e=>({name:e.originalName,tensor:e.variable})))}async setWeights(t){t=await this.extractIterations(t);let e=this.centered?t.length/3:t.length/2,o=!1;this.accumulatedMeanSquares=t.slice(0,e).map(n=>({originalName:n.name,variable:n.tensor.variable(o)})),this.accumulatedMoments=t.slice(e,e*2).map(n=>({originalName:n.name,variable:n.tensor.variable(o)})),this.centered&&(this.accumulatedMeanGrads=t.slice(e*2,e*3).map(n=>({originalName:n.name,variable:n.tensor.variable(o)})))}getConfig(){return{learningRate:this.learningRate,decay:this.decay,momentum:this.momentum,epsilon:this.epsilon,centered:this.centered}}static fromConfig(t,e){return new t(e.learningRate,e.decay,e.momentum,e.epsilon,e.centered)}};var vi=class{static sgd(t){return new wr(t)}static momentum(t,e,o=!1){return new No(t,e,o)}static rmsprop(t,e=.9,o=0,n=null,s=!1){return new To(t,e,o,n,s)}static adam(t=.001,e=.9,o=.999,n=null){return new Eo(t,e,o,n)}static adadelta(t=.001,e=.95,o=null){return new ko(t,e,o)}static adamax(t=.002,e=.9,o=.999,n=null,s=0){return new $o(t,e,o,n,s)}static adagrad(t,e=.1){return new Io(t,e)}};var nxt=vi;var B$=typeof requestAnimationFrame<"u"?requestAnimationFrame:typeof setImmediate<"u"?setImmediate:r=>r();function z$(){return new Promise(r=>B$(()=>r()))}var N={};Ht(N,{ERF_A1:()=>J$,ERF_A2:()=>tN,ERF_A3:()=>eN,ERF_A4:()=>rN,ERF_A5:()=>oN,ERF_P:()=>Q$,PARALLELIZE_THRESHOLD:()=>Fu,RowPartitionType:()=>or,SELU_SCALE:()=>am,SELU_SCALEALPHA:()=>im,applyActivation:()=>Co,assertAndGetBroadcastShape:()=>Q,assertAxesAreInnerMostDims:()=>N1,assertParamsConsistent:()=>L$,assignToTypedArray:()=>pN,axesAreInnerMostDims:()=>Jl,calculateShapes:()=>ug,checkEinsumDimSizes:()=>hN,checkPadOnDimRoundingMode:()=>ft,combineLocations:()=>Nd,combineRaggedTensorToTensorShapes:()=>O$,complexWithEvenIndex:()=>iN,complexWithOddIndex:()=>aN,computeConv2DInfo:()=>io,computeConv3DInfo:()=>ud,computeDefaultPad:()=>Yl,computeDilation2DInfo:()=>n1,computeOptimalWindowSize:()=>H$,computeOutAndReduceShapes:()=>tc,computeOutShape:()=>G$,computePool2DInfo:()=>jl,computePool3DInfo:()=>s1,convertConv2DDataFormat:()=>pd,decodeEinsumEquation:()=>fN,eitherStridesOrDilationsAreOne:()=>Bt,expandShapeToKeepDim:()=>Ne,exponent:()=>cN,exponents:()=>lN,fromStringArrayToUint8:()=>_N,fromUint8ToStringArray:()=>MN,getAxesPermutation:()=>ec,getBroadcastDims:()=>Qf,getComplexWithIndex:()=>uN,getEinsumComputePath:()=>gN,getEinsumPermutation:()=>dN,getFusedBiasGradient:()=>So,getFusedDyActivation:()=>wo,getImageCenter:()=>q$,getInnerMostAxes:()=>T1,getPermuted:()=>X$,getRaggedRank:()=>U$,getReductionAxes:()=>mt,getReshaped:()=>K$,getReshapedPermuted:()=>j$,getRowPartitionTypesHelper:()=>W$,getSliceBeginCoords:()=>Y$,getSliceSize:()=>Z$,getSparseFillEmptyRowsIndicesDenseShapeMismatch:()=>wN,getSparseFillEmptyRowsNegativeIndexErrorMessage:()=>SN,getSparseFillEmptyRowsOutOfRangeIndexErrorMessage:()=>CN,getSparseReshapeEmptyTensorZeroOutputDimErrorMessage:()=>IN,getSparseReshapeInputOutputMismatchErrorMessage:()=>$N,getSparseReshapeInputOutputMultipleErrorMessage:()=>EN,getSparseReshapeMultipleNegativeOneOutputDimErrorMessage:()=>vN,getSparseReshapeNegativeOutputDimErrorMessage:()=>kN,getSparseSegmentReductionIndicesOutOfRangeErrorMessage:()=>AN,getSparseSegmentReductionNegativeSegmentIdsErrorMessage:()=>NN,getSparseSegmentReductionNonIncreasingSegmentIdsErrorMessage:()=>TN,getSparseSegmentReductionSegmentIdOutOfRangeErrorMessage:()=>DN,getUndoAxesPermutation:()=>ii,isIdentityPermutation:()=>xN,log:()=>$0,mergeRealAndImagArrays:()=>nN,prepareAndValidate:()=>ig,prepareSplitSize:()=>bN,segment_util:()=>pm,shouldFuse:()=>vo,slice_util:()=>be,splitRealAndImagArrays:()=>sN,stridesOrDilationsArePositive:()=>Ye,tupleValuesAreOne:()=>ge,upcastType:()=>qt,validateDefaultValueShape:()=>V$,validateInput:()=>ws,validateUpdateShape:()=>kc,warn:()=>je});function L$(r,t){let e=r[0].length;r.forEach((n,s)=>{w(n.length===e,()=>`Error in concat${e}D: rank of tensors[${s}] must be the same as the rank of the rest (${e})`)}),w(t>=0&&t<e,()=>`Error in concat${e}D: axis must be between 0 and ${e-1}.`);let o=r[0];r.forEach((n,s)=>{for(let i=0;i<e;i++)w(i===t||n[i]===o[i],()=>`Error in concat${e}D: Shape of tensors[${s}] (${n}) does not match the shape of the rest (${o}) along the non-concatenated axis ${s}.`)})}function G$(r,t){let e=r[0].slice();for(let o=1;o<r.length;o++)e[t]+=r[o][t];return e}var or;(function(r){r[r.FIRST_DIM_SIZE=0]="FIRST_DIM_SIZE",r[r.VALUE_ROWIDS=1]="VALUE_ROWIDS",r[r.ROW_LENGTHS=2]="ROW_LENGTHS",r[r.ROW_SPLITS=3]="ROW_SPLITS",r[r.ROW_LIMITS=4]="ROW_LIMITS",r[r.ROW_STARTS=5]="ROW_STARTS"})(or||(or={}));function O$(r,t,e){let o=new Array;if(e==null&&t==null)return o;if(t==null)for(;o.length<r+e.length;)o.push(-1);else o=t.slice();if(e==null)return o;if(r+e.length!==o.length)throw new Error(`rt input.shape and shape=${t} are incompatible: rt input.rank = ${r+e.length}, but shape.rank = ${o.length}`);for(let n=1;n<e.length;++n){let s=e[n],i=o[o.length-e.length+n],a=o[i];if(s>=0)if(a>=0){if(a!==s)throw new Error(`rt input.shape and shape=${t} are incompatible: rt input.shape[${n+r}] = ${s} but shape[${n+r}] = ${a}`)}else o[i]=s}return o}function W$(r){let t={FIRST_DIM_SIZE:or.FIRST_DIM_SIZE,VALUE_ROWIDS:or.VALUE_ROWIDS,ROW_LENGTHS:or.ROW_LENGTHS,ROW_SPLITS:or.ROW_SPLITS,ROW_LIMITS:or.ROW_LIMITS,ROW_STARTS:or.ROW_STARTS},e=[];for(let o of r)if(o in t)e.push(t[o]);else break;return e}function U$(r){return r.length===0?0:r[0]===or.FIRST_DIM_SIZE?r.length-1:r.length}function V$(r,t){if(r==null||t==null)return;let e=r.length,o=t.length;if(e>=o)throw new Error(`defaultValue.shape=${r} and ragged tensor flatValues.shape=${t}, are incompatible: defaultValue.rank = ${e} must be less than ragged tensor input flatValues.rank = ${o})`);for(let n=0;n<Math.min(e,o-1);++n){let s=r[n],i=t[n+1];if(s>=0&&i>=0&&s!==1&&s!==i)throw new Error(`defaultValue.shape=${r}, and ragged tensor input flatValues.shape=${t} are incompatible: defaultValue.shape[${n-r.length}] = ${s} but ragged tensor input.flatValues.shape[${n-r.length}] = ${i}`)}}var Fu=30;function H$(r){return r<=Fu?r:os(r,Math.floor(Math.sqrt(r)))}function q$(r,t,e){let o=e*(typeof r=="number"?r:r[0]),n=t*(typeof r=="number"?r:r[1]);return[o,n]}function K$(r,t,e,o=!0){let n=[];if(o)n=n.concat(t.slice(0)),n.push(r[0]/e),n=n.concat(r.slice(1));else{n=n.concat(r[0]);let s=t.length;for(let i=0;i<s;++i)n=n.concat([r[i+1]/t[i],t[i]]);n=n.concat(r.slice(s+1))}return n}function X$(r,t,e=!0){let o=[];if(e){o.push(t);for(let n=t+1;n<r;++n)n<=2*t?(o.push(n),o.push(n-(t+1))):o.push(n)}else{let n=[],s=[];for(let i=1;i<r;++i)i>=t*2+1||i%2===1?s.push(i):n.push(i);o.push(...n),o.push(0),o.push(...s)}return o}function j$(r,t,e,o=!0){let n=[];o?n.push(r[0]/e):n.push(r[0]*e);for(let s=1;s<r.length;++s)s<=t.length?o?n.push(t[s-1]*r[s]):n.push(r[s]/t[s-1]):n.push(r[s]);return n}function Y$(r,t){let e=[0];for(let o=0;o<t;++o)e.push(r[o][0]);return e}function Z$(r,t,e){let o=r.slice(0,1);for(let n=0;n<e;++n)o.push(r[n+1]-t[n][0]-t[n][1]);return o}var im=1.7580993408473768,am=1.0507009873554805;var Q$=.3275911,J$=.254829592,tN=-.284496736,eN=1.421413741,rN=-1.453152027,oN=1.061405429;function nN(r,t){if(r.length!==t.length)throw new Error(`Cannot merge real and imag arrays of different lengths. real:${r.length}, imag: ${t.length}.`);let e=new Float32Array(r.length*2);for(let o=0;o<e.length;o+=2)e[o]=r[o/2],e[o+1]=t[o/2];return e}function sN(r){let t=new Float32Array(r.length/2),e=new Float32Array(r.length/2);for(let o=0;o<r.length;o+=2)t[o/2]=r[o],e[o/2]=r[o+1];return{real:t,imag:e}}function iN(r){let t=Math.ceil(r.length/4),e=new Float32Array(t),o=new Float32Array(t);for(let n=0;n<r.length;n+=4)e[Math.floor(n/4)]=r[n],o[Math.floor(n/4)]=r[n+1];return{real:e,imag:o}}function aN(r){let t=Math.floor(r.length/4),e=new Float32Array(t),o=new Float32Array(t);for(let n=2;n<r.length;n+=4)e[Math.floor(n/4)]=r[n],o[Math.floor(n/4)]=r[n+1];return{real:e,imag:o}}function uN(r,t){let e=r[t*2],o=r[t*2+1];return{real:e,imag:o}}function pN(r,t,e,o){r[o*2]=t,r[o*2+1]=e}function lN(r,t){let e=new Float32Array(r/2),o=new Float32Array(r/2);for(let n=0;n<Math.ceil(r/2);n++){let s=(t?2:-2)*Math.PI*(n/r);e[n]=Math.cos(s),o[n]=Math.sin(s)}return{real:e,imag:o}}function cN(r,t,e){let o=(e?2:-2)*Math.PI*(r/t),n=Math.cos(o),s=Math.sin(o);return{real:n,imag:s}}var um="->",mN=/->/g,Fx=",",Px="...";function fN(r,t){r=r.replace(/\s/g,"");let e=(r.length-r.replace(mN,"").length)/um.length;if(e<1)throw new Error("Equations without an arrow are not supported.");if(e>1)throw new Error(`Equation must contain exactly one arrow ("${um}").`);let[o,n]=r.split(um);w(o.indexOf(Px)===-1,()=>`The ellipsis notation ("${Px}") is not supported yet.`);let s=o.split(Fx),i=s.length;if(t!==i)throw new Error(`Expected ${i} input tensors, received ${t}`);if(i>2)throw new Error("Support for more than 2 input tensors is not implemented yet.");let a=[];for(let m=0;m<n.length;++m){let f=n[m];if(!s.some(h=>h.indexOf(f)!==-1))throw new Error(`Output subscripts contain the label ${f} not present in the input subscripts.`);a.indexOf(f)===-1&&a.push(f)}for(let m=0;m<o.length;++m){let f=o[m];a.indexOf(f)===-1&&f!==Fx&&a.push(f)}let u=new Array(s.length);for(let m=0;m<i;++m){if(new Set(s[m].split("")).size!==s[m].length)throw new Error(`Found duplicate axes in input component ${s[m]}. Support for duplicate axes in input is not implemented yet.`);u[m]=[];for(let f=0;f<s[m].length;++f)u[m].push(a.indexOf(s[m][f]))}let p=a.length,l=n.length,c=[];for(let m=l;m<p;++m)c.push(m);return{allDims:a,summedDims:c,idDims:u}}function dN(r,t){let e=new Array(r);e.fill(-1);for(let n=0;n<t.length;++n)e[t[n]]=n;let o=[];for(let n=0;n<r;++n)e[n]===-1&&o.push(n);return e=e.filter(n=>n!==-1),{permutationIndices:e,expandDims:o}}function hN(r,t,e){let o=new Array(r);for(let n=0;n<e.length;++n){let s=e[n].shape;for(let i=0;i<t[n].length;++i)o[t[n][i]]===void 0?o[t[n][i]]=s[i]:w(o[t[n][i]]===s[i],()=>`Expected dimension ${o[t[n][i]]} at axis ${i} of input shaped ${JSON.stringify(s)}, but got dimension ${s[i]}`)}}function gN(r,t){let e=r,o=[],n=0;r.length===0&&e.push(-1),n=r.length+1;for(let i=0;i<n;++i)o.push([]);let s=[];for(let i=0;i<e.length;++i){let a=e[i],u=yN(t,a);for(let p of u)s.indexOf(p)===-1&&(o[i].push(p),s.push(p))}return{path:e,steps:o}}function xN(r){return r.every((t,e)=>t===e)}function yN(r,t){let e=[];for(let o=0;o<r.length;++o)(r[o].length===0||r[o].indexOf(t)!==-1||t===-1)&&e.push(o);return e}function bN(r,t,e=0){let o=[];if(typeof t=="number")w(r.shape[e]%t===0,()=>"Number of splits must evenly divide the axis."),o=new Array(t).fill(r.shape[e]/t);else{let n=t.reduce((i,a)=>(a===-1&&(i+=1),i),0);w(n<=1,()=>"There should be only one negative value in split array.");let s=t.indexOf(-1);if(s!==-1){let i=t.reduce((a,u)=>u>0?a+u:a);t[s]=r.shape[e]-i}w(r.shape[e]===t.reduce((i,a)=>i+a),()=>"The sum of sizes must match the size of the axis dimension."),o=t}return o}function wN(r){return`Received SparseTensor with denseShape[0] = 0 but
  indices.shape[0] = ${r}`}function SN(r,t){return`indices(${r}, 0) is invalid: ${t} < 0`}function CN(r,t,e){return`indices(${r}, 0) is invalid: ${t} >= ${e}`}function vN(r,t){return`only one output dimension may be -1, not both ${r} and ${t}`}function kN(r,t){return`size ${r} must be non-negative, not ${t}`}function IN(){return"reshape cannot infer the missing input size for an empty tensor unless all specified input sizes are non-zero"}function EN(r,t){let e=rt(r),o=rt(t);return`Input to reshape is a SparseTensor with ${e}
  dense values, but the requested shape requires a multiple of ${o}. inputShape=${r} outputShape= ${t}`}function $N(r,t){let e=rt(r),o=rt(t);return`Input to reshape is a tensor with ${e} dense values, but the requested shape has ${o}. inputShape=${r} outputShape=${t}`}function NN(){return"segment ids must be >= 0"}function TN(){return"segment ids are not increasing"}function DN(r,t){return`Segment id ${r} out of range [0, ${t}), possibly because segmentIds input is not sorted.`}function AN(r,t,e){return`Bad: indices[${r}] == ${t} out of range [0, ${e})`}var pm={};Ht(pm,{collectGatherOpShapeInfo:()=>PN,computeOutShape:()=>FN,segOpComputeOptimalWindowSize:()=>RN});function RN(r,t){let e=!1,o;for(r<=Fu?(o=r,e=!0):o=os(r,Math.floor(Math.sqrt(r)));!e;)o>t||o===r?e=!0:o=os(r,o+1);return o}function FN(r,t,e){let o=[],n=r.length;for(let s=0;s<n;s++)s!==t?o.push(r[s]):o.push(e);return o}function PN(r,t,e,o){let n=t.shape.length,s=r.shape.length;if(o!==0&&(o<-n||o>n))throw new Error(`Expect batchDims in the range of [-${n}, ${n}], but got ${o}`);if(o<0&&(o+=n),o>s)throw new Error(`batchDims (${o}) must be less than rank(x) (
    ${s}).`);if(e<o)throw new Error(`batchDims (${o}) must be less than or equal to axis (${e}).`);for(let c=0;c<o;++c)if(r.shape[c]!==t.shape[c])throw new Error(`x.shape[${c}]: ${r.shape[c]} should be equal to indices.shape[${c}]: ${t.shape[c]}.`);let i=r.shape[e],a=[],u=1,p=1,l=1;for(let c=0;c<o;++c)a.push(r.shape[c]),u*=r.shape[c];for(let c=o;c<e;c++)a.push(r.shape[c]),p*=r.shape[c];for(let c=o;c<n;c++)a.push(t.shape[c]);for(let c=e+1;c<s;c++)a.push(r.shape[c]),l*=r.shape[c];return{batchSize:u,sliceSize:l,outerSize:p,dimSize:i,outputShape:a}}function MN(r){try{return r.map(t=>ls(t))}catch(t){throw new Error(`Failed to decode encoded string bytes into utf-8, error: ${t}`)}}function _N(r){return r.map(t=>Wr(t))}var Is={};Ht(Is,{nonMaxSuppressionV3Impl:()=>Du,nonMaxSuppressionV4Impl:()=>Au,nonMaxSuppressionV5Impl:()=>Ru,whereImpl:()=>Eu});function BN(r,t,e){let o=r.shape.slice();o[e]=1;let n=E(t,o),s=xu(r,e,!0,!1),i=xu(r,e,!0,!0),a=$(s,i);return $(n,a)}function zN(r,t,e){let o=r.shape.length,n=o-e.length,s=N.getAxesPermutation(e,o),i=r;s!=null&&(i=te(r,s));let a=i.shape.slice(),p=a.splice(o-e.length,e.length).reduce((m,f)=>m*f,1);a.push(p);let l=i.reshape(a),c=BN(l,t,n);if(c=c.reshape(i.shape),s!=null){let m=N.getUndoAxesPermutation(s);c=te(c,m)}return c}var Mx={kernelName:jr,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{axis:n}=e,s=[];return n==null?s=o.shape.map((i,a)=>a):typeof n=="number"?s=[n]:s=n,{x:()=>zN(o,r,s)}}};var _x={kernelName:un,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=Q(e.shape,o.shape);return{a:()=>{let a=V(r,_(o,"float32")),u=mt(e.shape,n);return u.length>0?E(K(a,u),e.shape):a},b:()=>{let a=$(r,_(e,"float32")),u=mt(o.shape,n);u.length>0&&(a=E(K(a,u),o.shape));let p=tt(o);return lt(V(a,_(p,"float32")))}}}};var Bx={kernelName:Fn,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,lt(tt(e)))}}};var zx={kernelName:zn,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t,o=$(Ge(e,6),cr(e));return{x:()=>$(r,_(o,"float32"))}}};var Lx={kernelName:Pn,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(r,_(cr(e),"float32"))}}};var Gx={kernelName:Mn,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>E(r,e.shape)}}};var Ox={kernelName:Bn,inputsToSave:["images"],gradFunc:(r,t,e)=>{let[o]=t,n={dy:r,images:o};return{images:()=>y.runKernel(Ia,n,e)}}};var Wx={kernelName:_n,inputsToSave:["images"],gradFunc:(r,t,e)=>{let[o]=t,n={dy:r,images:o};return{images:()=>y.runKernel(ka,n,e)}}};var Ux={kernelName:Ln,gradFunc:(r,t,e)=>{let{dims:o}=e,n=Rt(o,r.shape);return{x:()=>ue(r,n)}}};var Vx={kernelName:Gn,gradFunc:r=>({x:()=>Z(r)})};var Hx={kernelName:Pr,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>lt(V(r,$(De(e,1.5),2)))}}};var qx={kernelName:On,inputsToSave:["condition"],gradFunc:(r,t)=>{let[e]=t;return{condition:()=>_(Z(e),"float32"),t:()=>$(r,_(e,r.dtype)),e:()=>$(r,_(xi(e),r.dtype))}}};var Kx={kernelName:Wn,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>{let o=Zt(e,X(0)),n=X(im),s=X(am),i=$(r,s),a=$($(r,n),zt(_(e,"float32")));return It(o,i,a)}}}};var Xx={kernelName:Mr,outputsToSave:[!0],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(r,$(e,U(X(1),e)))}}};var jx={kernelName:Vn,gradFunc:r=>({x:()=>Z(r)})};var Yx={kernelName:"Sin",inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(di(_(e,"float32")),r)}}};var Zx={kernelName:Un,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(Pc(_(e,"float32")),r)}}};var Qx={kernelName:Yr,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{begin:n,size:s}=e,i=o.shape,[a,u]=Ec(o,n,s),p=[];for(let l=0;l<r.rank;l++)p.push([a[l],i[l]-a[l]-u[l]]);return{x:()=>Ve(r,p)}}};var Jx={kernelName:Xn,outputsToSave:[!0],gradFunc:(r,t,e)=>{let[o]=t,{dim:n}=e,s=!0,i=$(r,o);return{logits:()=>U(i,$(K(i,[n],s),o))}}};var ty={kernelName:Hn,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(r,Ue(e))}}};var lm={kernelName:qn,gradFunc:(r,t,e)=>{let{blockShape:o,paddings:n}=e;return{x:()=>fi(r,o,n)}}};var cm={kernelName:Kn,gradFunc:(r,t,e)=>{let{axis:o}=e;return{x:()=>Et(r,o)}}};var ey={kernelName:_r,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,$(At(_(e,"float32")),2))}}};var ry={kernelName:Pa,inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(r,$(_(e,"float32"),2))}}};var oy={kernelName:Br,inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=X(2);return{a:()=>$(r,$(n,U(e,o))),b:()=>$(r,$(n,U(o,e)))}}};var ny={kernelName:ts,gradFunc:r=>({x:()=>Z(r)})};var sy={kernelName:"Sub",inputsToSave:["a","b"],gradFunc:(r,t)=>{let[e,o]=t,n=Q(e.shape,o.shape);return{a:()=>{let a=r,u=mt(e.shape,n);return u.length>0&&(a=K(a,u)),E(a,e.shape)},b:()=>{let a=r,u=mt(o.shape,n);return u.length>0&&(a=K(a,u)),E(lt(a),o.shape)}}}};var iy={kernelName:"Sum",inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,n=o.shape.slice(),{axis:s}=e;Rt(s,o.shape).forEach(p=>{n[p]=1});let a=E(r,n),u=$(a,ee(o.shape,"float32"));return{x:()=>u}}};var ay={kernelName:"Tan",inputsToSave:["x"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>V(r,tt(di(e)))}}};var uy={kernelName:Yn,outputsToSave:[!0],gradFunc:(r,t)=>{let[e]=t;return{x:()=>$(U(X(1),tt(e)),r)}}};var py={kernelName:zr,inputsToSave:["x"],gradFunc:(r,t,e)=>{let[o]=t,{reps:n}=e;return{x:()=>{let i=Z(o);if(o.rank===1)for(let a=0;a<n[0];++a)i=O(i,at(r,[a*o.shape[0]],[o.shape[0]]));else if(o.rank===2)for(let a=0;a<n[0];++a)for(let u=0;u<n[1];++u)i=O(i,at(r,[a*o.shape[0],u*o.shape[1]],[o.shape[0],o.shape[1]]));else if(o.rank===3)for(let a=0;a<n[0];++a)for(let u=0;u<n[1];++u)for(let p=0;p<n[2];++p)i=O(i,at(r,[a*o.shape[0],u*o.shape[1],p*o.shape[2]],[o.shape[0],o.shape[1],o.shape[2]]));else if(o.rank===4)for(let a=0;a<n[0];++a)for(let u=0;u<n[1];++u)for(let p=0;p<n[2];++p)for(let l=0;l<n[3];++l)i=O(i,at(r,[a*o.shape[0],u*o.shape[1],p*o.shape[2],l*o.shape[3]],[o.shape[0],o.shape[1],o.shape[2],o.shape[3]]));else throw new Error(`Gradient for tile operation is not implemented for rank-${o.rank} tensors yet.`);return i}}}};var ly={kernelName:Lr,gradFunc:(r,t,e)=>{let o=e,{perm:n}=o,s=ii(n);return{x:()=>te(r,s)}}};var cy={kernelName:Zn,gradFunc:(r,t,e)=>{let o=e,{axis:n}=o;return{value:()=>Te(r,n)}}};var my={kernelName:Qn,inputsToSave:["segmentIds"],gradFunc:(r,t)=>{let[e]=t;return{x:()=>LN(r,e)}}};function LN(r,t){let e=yi(t,Z(t)),o=gi(r,e),n=mr(t,X(0,"int32")),s=o.rank-n.rank;for(let a=0;a<s;++a)n=Ae(n,a+1);n=Ze(n,ee(o.shape,"bool"));let i=Z(o);return It(n,o,i)}var fy={kernelName:Jn,gradFunc:r=>({x:()=>Z(r)})};var GN=[Ja,Yf,Zf,Jf,td,ed,rd,od,nd,sd,id,ad,cd,fd,dd,hd,gd,xd,yd,bd,wd,Sd,vd,Cd,Id,Ed,$d,Fd,Pd,Md,_x,_d,Bd,zd,Ld,Gd,Wd,Od,Ud,qd,Kd,Xd,jd,Yd,Zd,Qd,Jd,th,eh,oh,ic,ic,nh,ih,uh,ph,lh,ch,mh,fh,dh,hh,gh,xh,yh,ac,ac,bh,wh,Mx,Bx,zx,Lx,Gx,Ox,Wx,Ux,Vx,Hx,qx,Kx,Xx,jx,Yx,Zx,Qx,Jx,ty,lm,lm,cm,cm,ey,oy,ry,ny,sy,iy,ay,uy,py,ly,cy,my,fy];for(let r of GN)Cf(r);var mm=class{constructor(){this.messageName="setTimeoutCustom",this.functionRefs=[],this.handledMessageCount=0,this.hasEventListener=!1}fetch(t,e){return fetch(t,e)}now(){return performance.now()}encode(t,e){if(e!=="utf-8"&&e!=="utf8")throw new Error(`Browser's encoder only supports utf-8, but got ${e}`);return this.textEncoder==null&&(this.textEncoder=new TextEncoder),this.textEncoder.encode(t)}decode(t,e){return new TextDecoder(e).decode(t)}setTimeoutCustom(t,e){if(typeof window>"u"||!L().getBool("USE_SETTIMEOUTCUSTOM")){setTimeout(t,e);return}this.functionRefs.push(t),setTimeout(()=>{window.postMessage({name:this.messageName,index:this.functionRefs.length-1},"*")},e),this.hasEventListener||(this.hasEventListener=!0,window.addEventListener("message",o=>{if(o.source===window&&o.data.name===this.messageName){o.stopPropagation();let n=this.functionRefs[o.data.index];n(),this.handledMessageCount++,this.handledMessageCount===this.functionRefs.length&&(this.functionRefs=[],this.handledMessageCount=0)}},!0))}isTypedArray(t){return Ha(t)}};if(L().get("IS_BROWSER")){L().setPlatform("browser",new mm);try{We.registerManager(rr.URL_SCHEME,new uu)}catch{}try{We.registerManager(er.URL_SCHEME,new au)}catch{}}var ON={importFetch:()=>dy()},fm;var dm=class{constructor(){this.util=hy(),this.textEncoder=new this.util.TextEncoder}fetch(t,e){return L().global.fetch!=null?L().global.fetch(t,e):(fm==null&&(fm=ON.importFetch()),fm(t,e))}now(){let t=process.hrtime();return t[0]*1e3+t[1]/1e6}encode(t,e){if(e!=="utf-8"&&e!=="utf8")throw new Error(`Node built-in encoder only supports utf-8, but got ${e}`);return this.textEncoder.encode(t)}decode(t,e){return t.length===0?"":new this.util.TextDecoder(e).decode(t)}isTypedArray(t){return this.util.types.isFloat32Array(t)||this.util.types.isInt32Array(t)||this.util.types.isUint8Array(t)||this.util.types.isUint8ClampedArray(t)}};L().get("IS_NODE")&&!L().get("IS_BROWSER")&&L().setPlatform("node",new dm);ql();var WN={buffer:st,cast:_,clone:Oe,print:qc};Uf(WN);var UN=[ko,Io,Eo,$o,No,To,wr];function gy(){for(let r of UN)Nc(r)}gy();var we=L();we.registerFlag("WEBGPU_DEFERRED_SUBMIT_BATCH_SIZE",()=>15);we.registerFlag("WEBGPU_CPU_FORWARD",()=>!0);we.registerFlag("WEBGPU_MATMUL_PROGRAM_TYPE",()=>-1);we.registerFlag("WEBGPU_USE_NAIVE_CONV2D_TRANSPOSE",()=>!0);we.registerFlag("WEBGPU_USE_LOW_POWER_GPU",()=>!1);we.registerFlag("WEBGPU_CPU_HANDOFF_SIZE_THRESHOLD",()=>1e3);we.registerFlag("WEBGPU_USE_PROFILE_TOOL",()=>!1);we.registerFlag("WEBGPU_IMPORT_EXTERNAL_TEXTURE",()=>!0);we.registerFlag("WEBGPU_USE_NAIVE_CONV2D_DEBUG",()=>!1);we.registerFlag("WEBGPU_THRESHOLD_TO_INCREASE_WORKGROUPS_FOR_MATMUL",()=>-1);we.registerFlag("WEBGPU_CONV_SEPARATE_IM2COL_SHADER",()=>!1);we.registerFlag("WEBGPU_PRINT_SHADER",()=>"");we.registerFlag("WEBGPU_ENGINE_COMPILE_ONLY",()=>!1);var Pu=class{constructor(t){t&&(this.vendor=t.vendor,this.architecture=t.architecture,this.intelGPUGeneration=this.getIntelGPUGeneration())}getIntelGPUGeneration(){if(this.isIntel()){if(this.architecture.startsWith("gen"))return Number(this.architecture.match(/\d+/));if(this.architecture.startsWith("xe"))return 12}return 0}isIntel(){return this.vendor==="intel"}};var Mu=class{constructor(t){this.device=t,this.numUsedBuffers=0,this.numFreeBuffers=0,this.freeBuffers=new Map,this.usedBuffers=new Map,this.numBytesUsed=0,this.numBytesAllocated=0}acquireBuffer(t,e,o=!1,n=!0){let s,i=xy(t,e);return n?(this.freeBuffers.has(i)||this.freeBuffers.set(i,[]),this.freeBuffers.get(i).length>0?(s=this.freeBuffers.get(i).pop(),this.numFreeBuffers--):(s=this.device.createBuffer({size:t,usage:e,mappedAtCreation:o}),this.numBytesAllocated+=t)):(s=this.device.createBuffer({size:t,usage:e,mappedAtCreation:o}),this.numBytesAllocated+=t),this.usedBuffers.has(i)||this.usedBuffers.set(i,[]),this.usedBuffers.get(i).push(s),this.numUsedBuffers++,this.numBytesUsed+=t,s}releaseBuffer(t,e=!0){if(this.freeBuffers.size===0)return;let o=t.size,n=t.usage,s=xy(o,n),i=this.usedBuffers.get(s),a=i.indexOf(t);if(a<0)throw new Error("Cannot find the buffer in buffer manager");i[a]=i[i.length-1],i.pop(),this.numUsedBuffers--,this.numBytesUsed-=o,e?(this.freeBuffers.get(s).push(t),this.numFreeBuffers++):(t.destroy(),this.numBytesAllocated-=o)}getNumUsedBuffers(){return this.numUsedBuffers}getNumFreeBuffers(){return this.numFreeBuffers}dispose(){this.freeBuffers.forEach((t,e)=>{t.forEach(o=>{o.destroy()})}),this.usedBuffers.forEach((t,e)=>{t.forEach(o=>{o.destroy()})}),this.freeBuffers=new Map,this.usedBuffers=new Map,this.numUsedBuffers=0,this.numFreeBuffers=0,this.numBytesUsed=0,this.numBytesAllocated=0}};function xy(r,t){return`${r}_${t}`}var _u=class{constructor(t){this.device=t,this.numUsedTextures=0,this.numFreeTextures=0,this.freeTextures=new Map,this.usedTextures=new Map,this.numBytesUsed=0,this.numBytesAllocated=0}acquireTexture(t,e,o,n){let s=by(o),i=t*e*s,a=yy(t,e,o,n);if(this.freeTextures.has(a)||this.freeTextures.set(a,[]),this.usedTextures.has(a)||this.usedTextures.set(a,[]),this.numBytesUsed+=i,this.numUsedTextures++,this.freeTextures.get(a).length>0){this.numFreeTextures--;let p=this.freeTextures.get(a).shift();return this.usedTextures.get(a).push(p),p}this.numBytesAllocated+=i;let u=this.device.createTexture({size:[t,e],format:o,usage:n});return this.usedTextures.get(a).push(u),u}releaseTexture(t){if(this.freeTextures.size===0)return;let e=t.width,o=t.height,n=t.format,s=t.usage,i=yy(e,o,n,s);this.freeTextures.has(i)||this.freeTextures.set(i,[]),this.freeTextures.get(i).push(t),this.numFreeTextures++,this.numUsedTextures--;let a=this.usedTextures.get(i),u=a.indexOf(t);if(u<0)throw new Error("Cannot release a texture that was never provided by this texture manager");a.splice(u,1);let p=by(n),l=e*o*p;this.numBytesUsed-=l}getNumUsedTextures(){return this.numUsedTextures}getNumFreeTextures(){return this.numFreeTextures}dispose(){this.freeTextures.forEach((t,e)=>{t.forEach(o=>{o.destroy()})}),this.usedTextures.forEach((t,e)=>{t.forEach(o=>{o.destroy()})}),this.freeTextures=new Map,this.usedTextures=new Map,this.numUsedTextures=0,this.numFreeTextures=0,this.numBytesUsed=0,this.numBytesAllocated=0}};function yy(r,t,e,o){return`${r}_${t}_${e}_${o}`}function by(r){if(r==="rgba8unorm")return 16;throw new Error(`${r} is not supported!`)}function wy(r,t){if(Math.max(...r)>5)throw new Error("Cannot symbolically compute strides for rank > 6 tensor.");let e=r.length,o="xyzwuv",n=r.map(i=>`${t}.${o[i]}`),s=new Array(e-1);s[e-2]=n[e-1];for(let i=e-3;i>=0;--i)s[i]=`(${s[i+1]} * ${n[i+1]})`;return s}var pe=(r,t,e)=>e==="int32"?`atomicAdd(${r}, bitcast<i32>(${t}));`:`
          {
            var oldValue = 0;
            loop {
              let newValueF32 = bitcast<f32>(oldValue) + (${t});
              let newValue = bitcast<i32>(newValueF32);
              let res = atomicCompareExchangeWeak(${r}, oldValue, newValue);
              if res.exchanged {
                break;
              }
              oldValue = res.old_value;
            }
          }`;var Sr;(function(r){r[r.FROM_PIXELS=0]="FROM_PIXELS",r[r.DRAW=1]="DRAW"})(Sr||(Sr={}));var ky=(r,t,e,o,n)=>{let s={dtype:o.dtype,shape:o.shape},i=qN(e,s,t),a=r.createShaderModule({code:i,label:t.constructor.name}),u=L().get("WEBGPU_PRINT_SHADER");if(u!==""){u=u.toLowerCase();let p=u.split(",");(u==="all"||p.some(l=>t.shaderKey.toLowerCase().includes(l)))&&(console.group(t.shaderKey),console.debug(i),console.groupEnd())}return n?r.createComputePipelineAsync({compute:{module:a,entryPoint:"_start"},label:t.constructor.name,layout:"auto"}):r.createComputePipeline({compute:{module:a,entryPoint:"_start"},label:t.constructor.name,layout:"auto"})},et=(r,t="f32")=>{switch(r){case 1:return`${t}`;case 2:return`vec2<${t}>`;case 3:return`vec3<${t}>`;case 4:return`vec4<${t}>`;default:throw new Error(`${r}-component ${t} is not supported.`)}};function ht(r){if(r<=1)return"i32";if(r===2)return"vec2<i32>";if(r===3)return"vec3<i32>";if(r===4)return"vec4<i32>";if(r===5)return"vec5";if(r===6)return"vec6";throw Error(`GPU for rank ${r} is not yet supported`)}function Fe(r){if(r===0)return"x";if(r===1)return"y";if(r===2)return"z";if(r===3)return"w";if(r===4)return"u";if(r===5)return"v";throw Error(`Index ${r} is not yet supported`)}function D(...r){let t;switch(r.length){case 0:t=`
        fn main()
      `;break;case 1:t=`
        fn main(${r[0]} : i32)
      `;break;default:throw Error("Unreachable")}return t}function Sy(r,t){let e;return e=`
     ${HN(t)}
      fn _start(@builtin(local_invocation_id) LocalId : vec3<u32>,
                @builtin(global_invocation_id) GlobalId : vec3<u32>,
                @builtin(local_invocation_index) LocalIndex: u32,
                @builtin(workgroup_id) WorkgroupId : vec3<u32>,
                @builtin(num_workgroups) NumWorkgroups : vec3<u32>) {
        localId = LocalId;
        localIndex = LocalIndex;
        globalId = GlobalId;
        numWorkgroups = NumWorkgroups;
        workgroupId = WorkgroupId;
        ${r?"main(getGlobalIndex());":"main();"};
      }
    `,e}function HN(r){return`
  @compute @workgroup_size(${r.workgroupSize[0]}, ${r.workgroupSize[1]}, ${r.workgroupSize[2]})
`}function qN(r,t,e){let o=[],n=e.workgroupSize[0]*e.workgroupSize[1]*e.workgroupSize[2];if(e.outputComponent=e.outputComponent?e.outputComponent:1,o.push(`

      var<private> localId: vec3<u32>;
      var<private> localIndex: u32;
      var<private> globalId: vec3<u32>;
      var<private> numWorkgroups: vec3<u32>;
      var<private> workgroupId: vec3<u32>;

      // Only used when the y/z dimension of workgroup size is 1.
      fn getGlobalIndex() -> i32 {
        ${Ey(e)?"  return i32(globalId.x);":`  return i32((workgroupId.z * numWorkgroups.x * numWorkgroups.y +
                workgroupId.y * numWorkgroups.x + workgroupId.x) * ${n}u +
                localIndex);
        `}
      }
    `),e.pixelsOpType!=null){let h=e.pixelsOpType===Sr.FROM_PIXELS?`@group(0) @binding(0) var<storage, read_write> result: array<${qr(t.dtype,e.outputComponent)}>;`:`@group(0) @binding(1) var<storage, read> inBuf : array<${qr(r[0].dtype,e.outputComponent)}>;`,b=t.shape.length===3?"vec2<i32>":"i32";o.push(`
        struct Uniform {
          outShapeStrides : ${b},
          size            : i32,
          numChannels     : i32,
          alpha           : f32,
        };

        ${h}
        @group(0) @binding(2) var<uniform> uniforms: Uniform;
      `);let x=vy(e);return[Cy,o.join(`
`),ki(t.shape),e.getUserCode(),Sy(x,e)].join(`
`)}let s,i,a="struct Uniforms { NAN : f32, INFINITY : f32, ";e.variableNames.forEach((h,b)=>{let x=ht(r[b].shape.length);a+=`${h.charAt(0).toLowerCase()+h.slice(1)}Shape : ${x}, `,s=r[b].shape.length-1,i=ht(s),a+=`${h.charAt(0).toLowerCase()+h.slice(1)}ShapeStrides: ${i}, `});let u=ht(t.shape.length);a+=`outShape : ${u}, `,s=t.shape.length-1,i=ht(s),a+=`
         outShapeStrides: ${i}, `,e.size&&(a+="size : i32, "),e.uniforms&&(a+=e.uniforms),a+="};",a=tT(a),o.push(a),e.atomic?o.push(`
      @group(0) @binding(0) var<storage, read_write> result: array<atomic<i32>>;
    `):o.push(`
      @group(0) @binding(0) var<storage, read_write> result: array<${qr(t.dtype,e.outputComponent)}>;
    `),e.variableNames.forEach((h,b)=>{o.push(`
      @group(0) @binding(${1+b}) var<storage, read> ${h}: array<${e.variableComponents?qr(r[b].dtype,e.variableComponents[b]):qr(r[b].dtype,e.outputComponent)}>;
        `)}),a!==""&&o.push(`
      @group(0) @binding(${1+e.variableNames.length}) var<uniform> uniforms: Uniforms;
      `);let p=ZN(t.shape,e.dispatchLayout),l=[Cy,o.join(`
`)+KN,ki(t.shape),p,QN(t.shape.length)];e.atomic||l.push(JN(t.shape,t.dtype,e.outputComponent)),e.variableNames.forEach((h,b)=>{l.push(`${ki(r[b].shape,h)}`)});let c=r.map((h,b)=>YN(h,t.shape,e.variableComponents?e.variableComponents[b]:e.outputComponent,e.dispatchLayout.x.length===t.shape.length)).join(`
`);l.push(c),l.push(e.getUserCode());let m=vy(e);return l.push(Sy(m,e)),l.join(`
`)}function Iy(r,t,e){let o=r.shaderKey;if(r.pixelsOpType!=null)return o;let n=[],s=[];t.forEach(l=>{n.push(l.shape),s.push(l.dtype)}),n.push(e.shape),s.push(e.dtype);let i=t.map(l=>N.getBroadcastDims(l.shape,e.shape)),a=t.map(l=>S.arraysEqual(l.shape,e.shape)).join("_"),u=i.map(l=>l.join("_")).join(";"),p=Ey(r)?"flatDispatch":"";return o+="_"+(r.workgroupSize?r.workgroupSize.join(","):"")+n.map(l=>l.length).join(",")+s.join(",")+r.variableNames.join(",")+u+a+p,o}var Cy=`
  struct vec5 {x: i32, y: i32, z: i32, w: i32, u: i32};
  struct vec6 {x: i32, y: i32, z: i32, w: i32, u: i32, v: i32};

  // Checks whether coordinates lie within the bounds of the shape.
  fn coordsInBounds2D(coord : vec2<i32>, shape : vec2<i32>) -> bool {
    return all(coord >= vec2<i32>(0)) && all(coord < shape);
  }
  fn coordsInBounds3D(coord : vec3<i32>, shape : vec3<i32>) -> bool {
    return all(coord >= vec3<i32>(0)) && all(coord < shape);
  }
  fn coordsInBounds4D(coord : vec4<i32>, shape : vec4<i32>) -> bool {
    return all(coord >= vec4<i32>(0)) && all(coord < shape);
  }

  fn getIndexFromCoords1D(coord : i32, shape : i32) -> i32 {
    return coord;
  }
  fn getIndexFromCoords2D(coords : vec2<i32>, shape : vec2<i32>) -> i32 {
    return dot(coords, vec2<i32>(shape.y, 1));
  }
  fn getIndexFromCoords3D(coords : vec3<i32>, shape : vec3<i32>) -> i32 {
    return dot(coords, vec3<i32>(shape.y * shape.z, shape.z, 1));
  }
  fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
    return dot(coords, vec4<i32>(
        shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
  }
  fn getIndexFromCoords5D(coords : vec5, shape : vec5) -> i32 {
    let shapeStrides: vec5 = vec5(shape.y * shape.z * shape.w * shape.u, shape.z * shape.w * shape.u, shape.w * shape.u, shape.u, 1);
    return coords.x*shapeStrides.x + coords.y*shapeStrides.y + coords.z*shapeStrides.z + coords.w*shapeStrides.w + coords.u*shapeStrides.u;
  }
  fn getIndexFromCoords6D(coords : vec6, shape : vec6) -> i32 {
    let shapeStrides: vec6 = vec6(shape.y * shape.z * shape.w * shape.u * shape.v, shape.z * shape.w * shape.u * shape.v, shape.w * shape.u * shape.v, shape.u * shape.v, shape.v, 1);
    return coords.x*shapeStrides.x + coords.y*shapeStrides.y + coords.z*shapeStrides.z + coords.w*shapeStrides.w + coords.u*shapeStrides.u + coords.v*shapeStrides.v;
  }

  // NaN defination in IEEE 754-1985 is :
  //   - sign = either 0 or 1.
  //   - biased exponent = all 1 bits.
  //   - fraction = anything except all 0 bits (since all 0 bits represents infinity).
  // https://en.wikipedia.org/wiki/IEEE_754-1985#Representation_of_non-numbers
  fn isnan(val: f32) -> bool {
    let floatToUint: u32 = bitcast<u32>(val);
    return (floatToUint & 0x7fffffffu) > 0x7f800000u;
  }
  fn isnanVec4(val : vec4<f32>) -> vec4<bool> {
    let floatToUint: vec4<u32> = bitcast<vec4<u32>>(val);
    return (floatToUint & vec4<u32>(0x7fffffffu)) > vec4<u32>(0x7f800000u);
  }
`,KN=`
  fn isinf(val: f32) -> bool {
    return abs(val) == uniforms.INFINITY;
  }
`;function ki(r,t=""){let e=r.length,o=t!==""?`get${t.charAt(0).toUpperCase()+t.slice(1)}CoordsFromIndex`:"getCoordsFromIndex",n=t!==""?`${t.charAt(0).toLowerCase()+t.slice(1)}ShapeStrides`:"outShapeStrides";if(e<=1)return`fn ${o}(index : i32) -> i32 { return index; }`;let s=S.computeStrides(r),i=ht(e),a=[];for(let p=0;p<e;p++)a.push(`d${p}`);if(s.length===1)return`    fn ${o}(index : i32) -> vec2<i32> {
      let d0 = index / uniforms.${n}; let d1 = index - d0 * uniforms.${n};
      return vec2<i32>(d0, d1);
    }`;let u;return u="var index2 = index;"+s.map((p,l)=>{let c=`let ${a[l]} = index2 / uniforms.${n}.${Fe(l)}`,m=l===s.length-1?`let ${a[l+1]} = index2 - ${a[l]} * uniforms.${n}.${Fe(l)}`:`index2 = index2 - ${a[l]} * uniforms.${n}.${Fe(l)}`;return`${c}; ${m};`}).join(""),`
    fn ${o}(index : i32) -> ${i} {
      ${u}
      return ${i}(${a.join(",")});
    }
  `}function XN(r,t){let e=r.name,o=r.shape.length,n=ht(o),s="get"+e.charAt(0).toUpperCase()+e.slice(1),i=["d0","d1","d2","d3","d4","d5"].slice(0,o),a=i.map(l=>`${l} : i32`).join(", ");if(o<1)return`
      fn ${s}() -> ${et(t)} {
        return ${et(t)}(${e}[0]);
      }
    `;let u=`uniforms.${e.charAt(0).toLowerCase()+e.slice(1)}Shape`,p=`${o}D`;return o===0&&(p="1D"),`
    fn ${s}(${a}) -> ${et(t)} {
      return ${et(t)}(${e}[getIndexFromCoords${p}(${n}(${i.join(",")}),
        ${u})${t===1?"":` / ${t}`}]);
    }
   `}function jN(r,t,e,o){let n=r.name,s=n.charAt(0).toUpperCase()+n.slice(1),i="get"+s+"ByOutput",a=r.shape.length,u=t.length,p=ht(u);if(S.arraysEqual(r.shape,t)&&o)return`
    fn ${i}Index(globalIndex : i32) -> ${et(e)} {
      return ${et(e)}(${n}[globalIndex]);
    }

    fn ${i}Coords(coords : ${p}) -> ${et(e)} {
      return ${et(e)}(${n}[${u>1?"getOutputIndexFromCoords(coords)":"coords"}${e===1?"":` / ${e}`}]);
    }
    `;let l=N.getBroadcastDims(r.shape,t),c=u-a,m="";if(a===0)return`
    fn ${i}Index(globalIndex : i32) -> ${et(e)}{
      return get${s}();
    }

    fn ${i}Coords(coords : ${p}) -> ${et(e)}{
      return get${s}();
    }
  `;u<2&&l.length>=1?m="coords = 0;":m=l.map(x=>`coords.${Fe(x+c)} = 0;`).join(`
`);let f="";if(u<2&&a>0)f="coords";else if(u>1){let x=ht(a),C=r.shape.map((k,v)=>`coords.${Fe(v+c)}`).join(", ");f=`${x}(${C})`}else f="coords";let h=`uniforms.${n.charAt(0).toLowerCase()+n.slice(1)}Shape`,b=`${a}D`;return`
  fn ${i}Index(globalIndex : i32) -> ${et(e)} {
    var coords = getCoordsFromIndex(globalIndex);
    ${m}
    return ${et(e)}(${n}[getIndexFromCoords${b}(${f}, ${h})${e===1?"":` / ${e}`}]);
  }

  fn ${i}Coords(coordsIn : ${p}) -> ${et(e)} {
    var coords = coordsIn;
    ${m}
    return ${et(e)}(${n}[getIndexFromCoords${b}(${f}, ${h})${e===1?"":` / ${e}`}]);
  }
`}function YN(r,t,e,o){let n=XN(r,e);return r.shape.length<=t.length&&(n+=jN(r,t,e,o)),n}function ZN(r,t){let{x:e,y:o=[],z:n=[]}=t,s=r.length,i=e.length+o.length+n.length;if(i!==s)return"";if(e.length===s)return`fn getOutputCoords() -> ${ht(s)}{
    let globalIndex = getGlobalIndex();
    return getCoordsFromIndex(globalIndex);
  }
  `;let a="",u=[e,o,n];for(let m=0;m<u.length;m++){let f=u[m];if(f.length!==0)if(f.length===1)a+=`let d${f[0]} = i32(globalId[${m}]);`;else{let h=wy(f,"uniforms.outShape");a+=`var index${m} = i32(globalId[${m}]);`;for(let b=0;b<h.length;b++)a+=`let d${f[b]} = index${m} / ${h[b]};`,b===h.length-1?a+=`let d${f[b+1]} = index${m} - d${f[b]} * ${h[b]};`:a+=`index${m} = index${m} - d${f[b]} * ${h[b]};`}}let p=[];for(let m=0;m<i;m++)p.push(`d${m}`);let l=ht(i),c=`fn getOutputCoords() -> ${l} {
  ${a}
`;return p.length===0?c+=`return ${l}(0); }`:c+=`return ${l}(${p.join(",")}); }`,c}function QN(r){let t="";switch(r){case 0:case 1:t+=`
        fn getOutputIndexFromCoords(coords : i32) -> i32 {
          return coords;
        }
        `;break;case 2:t+=`
        fn getOutputIndexFromCoords(coords : vec2<i32>) -> i32 {
          return dot(coords, vec2<i32>(uniforms.outShapeStrides, 1));
        }
        `;break;case 3:t+=`
        fn getOutputIndexFromCoords(coords : vec3<i32>) -> i32 {
          return dot(coords, vec3<i32>(uniforms.outShapeStrides.x, uniforms.outShapeStrides.y, 1));
        }
        `;break;case 4:t+=`
        fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
          return dot(coords, vec4<i32>(
            uniforms.outShapeStrides.x, uniforms.outShapeStrides.y, uniforms.outShapeStrides.z, 1));
        }
        `;break;case 5:t+=`
        fn getOutputIndexFromCoords(coords : vec5) -> i32 {
          return coords.x * uniforms.outShapeStrides.x +
              coords.y * uniforms.outShapeStrides.y +
              coords.z * uniforms.outShapeStrides.z +
              coords.w * uniforms.outShapeStrides.w +
              coords.u;
        }
        `;break;case 6:t+=`
        fn getOutputIndexFromCoords(coords : vec6) -> i32 {
          return coords.x * uniforms.outShapeStrides.x +
              coords.y * uniforms.outShapeStrides.y +
              coords.z * uniforms.outShapeStrides.z +
              coords.w * uniforms.outShapeStrides.w +
              coords.u * uniforms.outShapeStrides.u +
              coords.v;
        }
        `;break;default:S.assert(!1,()=>`Unsupported ${r}D shape`);break}return t}function Ey(r){return r.dispatch[1]===1&&r.dispatch[2]===1}function qr(r,t=1){if(r==="float32")return et(t,"f32");if(r==="int32"||r==="bool")return et(t,"i32");throw new Error(`type ${r} is not supported.`)}function JN(r,t,e){let o=r.length,n=qr(t,e),s=`fn setOutputAtIndex(flatIndex : i32, value : ${et(e)}) {
      result[flatIndex] = ${n}(value);
    }

    fn setOutputAtIndexI32(flatIndex : i32, value : ${et(e,"i32")}) {
      result[flatIndex] = ${n}(value);
    }
    `;if(o>=2){let i=["d0","d1","d2","d3","d4","d5"].slice(0,o),a=ht(o);s+=`
      fn setOutputAtCoords(${i.map(u=>`${u} : i32`).join(", ")}, value : ${et(e)}) {
        let flatIndex = getOutputIndexFromCoords(${a}(${i.join(", ")}));
        setOutputAtIndex(flatIndex${e===1?"":` / ${e}`}, value);
      }
      fn setOutputAtCoordsI32(${i.map(u=>`${u} : i32`).join(", ")}, value : ${et(e,"i32")}) {
        let flatIndex = getOutputIndexFromCoords(${a}(${i.join(", ")}));
        setOutputAtIndexI32(flatIndex${e===1?"":` / ${e}`}, value);
      }
    `}return s}function tT(r){let t=/(\w+)\s*:\s*vec(5|6)/g;r=r.replace(t,o=>"@align(16) "+o);let e=/vec(5|6)\s*,\s*(\w+)/g;return r=r.replace(e,(o,n,s)=>`vec${n}, @align(16) ${s}`),r}function vy(r){return!(r.dispatchLayout.hasOwnProperty("y")&&r.dispatchLayout.y.length!==0||r.dispatchLayout.hasOwnProperty("z")&&r.dispatchLayout.z.length!==0)}var Do=r=>{let t=1;for(let e=0;e<r.length;e++)t*=r[e];return t};function A(r,t,e=[1,1,1],o=[1,1,1]){let[n,s,i]=[Math.ceil(Do(r.x.map(a=>t[a]))/(e[0]*o[0])),r.y?Math.ceil(Do(r.y.map(a=>t[a]))/(e[1]*o[1])):1,r.z?Math.ceil(Do(r.z.map(a=>t[a]))/(e[2]*o[2])):1];return[n,s,i]}function $y(r,t,e,o=!1){let n=[8,8,1],s=[4,4,1];return o||(r<=8&&(s[1]=1),t<=16&&e<=16&&(n[0]=4)),{workgroupSize:n,elementsPerThread:s}}function Bu(r,t,e=!1){if(e)return[8,8,1];let o=Do(r.x.map(s=>t[s])),n=Do(r.y.map(s=>t[s]));return o<=4?[4,16,1]:n<=4?[16,4,1]:[16,16,1]}function zu(r,t,e=!1){if(e)return[4,4,1];let o=Do(r.x.map(s=>t[s])),n=Do(r.y.map(s=>t[s]));return o<=4?[1,2,1]:n<=4?[2,1,1]:[2,2,1]}function F(r){return{x:r.map((t,e)=>e)}}function hm(r){if(r==="float32"||r==="int32"||r==="bool"||r==="string")return 4;if(r==="complex64")return 8;throw new Error(`Unknown dtype ${r}`)}function Lu(){return!!(typeof globalThis<"u"&&globalThis.navigator&&globalThis.navigator.gpu)}function Gu(r,t){Array.isArray(r)||(r=[r]),r.forEach(e=>{e!=null&&S.assert(e.dtype!=="complex64",()=>`${t} does not support complex64 tensors in the WebGPU backend.`)})}var He;(function(r){r[r.MatMulReduceProgram=0]="MatMulReduceProgram",r[r.MatMulSplitKProgram=1]="MatMulSplitKProgram",r[r.MatMulSmallOutputSizeProgram=2]="MatMulSmallOutputSizeProgram",r[r.MatMulPackedProgram=3]="MatMulPackedProgram",r[r.MatMulMax=4]="MatMulMax"})(He||(He={}));var rT=L().getNumber("WEBGPU_CPU_HANDOFF_SIZE_THRESHOLD"),oT=(r,t)=>{let e=r.limits.maxComputeWorkgroupsPerDimension,o=t.dispatchLayout,n=t.dispatch;if(n.every(i=>i<=e))return n;S.assert(n[0]>e&&o.y===void 0&&o.z===void 0,()=>"Dispatch size exceeds WebGPU limits in Y or Z dimension.");let s=Math.ceil(Math.sqrt(n[0]));return s>e?(s=Math.ceil(Math.cbrt(n[0])),S.assert(s<=e,()=>"Total dispatch size exceeds WebGPU maximum."),[s,s,s]):[s,s,1]},Es=class r extends Zr{nextDataId(){return r.nextDataId++}constructor(t,e){if(super(),this.commandQueueOwnedIds=new WeakSet,this.dispatchCountInPass=0,this.disposed=!1,this.downloadWaitMs=0,this.tensorDataPendingDisposal=[],this.queryResolveBuffer=null,this.querySet=null,this.querySetCount=2,this.stagingPendingDisposal=[],this.uniformPendingDisposal=[],this.uploadWaitMs=0,this.hasReadSyncWarned=!1,this.hasTimestampQueryWarned=!1,!Lu())throw new Error("WebGPU is not supported on this device");this.pipelineCache={},this.device=t,this.queue=t.queue,this.commandEncoder=null,this.computePassEncoder=null,this.adapterInfo=new Pu(e),this.supportTimestampQuery=this.device.features.has("timestamp-query"),this.thresholdToIncreaseWorkgroups=this.adapterInfo.intelGPUGeneration>=12?16:8,this.bufferManager=new Mu(this.device),this.textureManager=new _u(this.device),this.tensorMap=new qs(this,eu()),L().getBool("WEBGPU_USE_PROFILE_TOOL")&&(this.dummyCanvas=document.createElement("canvas"),this.dummyCanvas.width=1,this.dummyCanvas.height=1,this.dummyContext=this.dummyCanvas.getContext("webgpu"),this.dummyContext.configure({device:t,format:"bgra8unorm"}),document.body.appendChild(this.dummyCanvas))}floatPrecision(){return 32}disposeData(t,e=!1){if(!this.tensorMap.has(t))return!0;let o=this.tensorMap.get(t);return e?o.refCount=0:o.refCount--,o.refCount>0?!1:(o.complexTensorInfos!=null&&(this.disposeData(o.complexTensorInfos.real.dataId),this.disposeData(o.complexTensorInfos.imag.dataId)),this.commandQueueOwnedIds.has(t)?(this.tensorDataPendingDisposal.push(t),!0):(this.releaseResource(t),this.tensorMap.delete(t),!0))}memory(){return{numBytesInGPU:this.bufferManager.numBytesUsed,numBytesAllocatedInGPU:this.bufferManager.numBytesAllocated,unreliable:!1}}releaseResource(t){let e=this.tensorMap.get(t);if(!(!e||!e.resource)){if(e.external){e.resource=null;return}e.resource instanceof GPUBuffer?this.bufferManager.releaseBuffer(e.resource):e.resource instanceof GPUTexture&&this.textureManager.releaseTexture(e.resource),e.resource=null}}refCount(t){return this.tensorMap.has(t)?this.tensorMap.get(t).refCount:0}incRef(t){let e=this.tensorMap.get(t);e.refCount++}decRef(t){if(this.tensorMap.has(t)){let e=this.tensorMap.get(t);e.refCount--}}write(t,e,o){if(o==="complex64"&&t!=null)throw new Error("Cannot write to a complex64 dtype. Please use tf.complex(real, imag).");let n={id:this.nextDataId()};return this.tensorMap.set(n,{dtype:o,shape:e,values:t,refCount:1}),n}move(t,e,o,n,s){if(n==="complex64")throw new Error("Cannot write to a complex64 dtype. Please use tf.complex(real, imag).");this.tensorMap.set(t,{dtype:n,shape:o,values:e,refCount:s})}submitQueue(){this.queue.submit([this.commandEncoder.finish()]),this.commandEncoder=null,this.dispatchCountInPass=0,this.commandQueueOwnedIds=new WeakSet,this.tensorDataPendingDisposal.forEach(t=>{this.releaseResource(t),this.tensorMap.delete(t)}),this.uniformPendingDisposal.forEach(t=>this.bufferManager.releaseBuffer(t)),this.stagingPendingDisposal.forEach(t=>this.bufferManager.releaseBuffer(t,!1)),this.tensorDataPendingDisposal=[],this.uniformPendingDisposal=[],this.stagingPendingDisposal=[]}ensureCommandEncoderReady(){this.commandEncoder||(this.commandEncoder=this.device.createCommandEncoder())}endComputePassEncoder(){this.computePassEncoder&&(this.computePassEncoder.end(),this.computePassEncoder=null)}async checkCompileCompletionAsync(){let t;try{t=await Promise.all(Object.values(this.pipelineCache))}catch(e){throw new Error(e.message)}Object.keys(this.pipelineCache).map((e,o)=>{this.pipelineCache[e]=t[o]})}async getBufferData(t){if(L().getBool("WEBGPU_ENGINE_COMPILE_ONLY"))return console.warn("The data may be invalid since WEBGPU_ENGINE_COMPILE_ONLY is true, this can only be called when WEBGPU_ENGINE_COMPILE_ONLY is false"),null;let e=t.size,o=this.bufferManager.acquireBuffer(e,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(t,0,o,0,e),this.submitQueue(),await o.mapAsync(GPUMapMode.READ);let n=o.getMappedRange().slice(0);return o.unmap(),o!=null&&this.bufferManager.releaseBuffer(o),L().getBool("WEBGPU_USE_PROFILE_TOOL")&&(S.assert(this.dummyContext!==void 0,()=>"Fail to get context for profiling tool"),this.dummyContext.getCurrentTexture()),n}convertAndCacheOnCPU(t,e){let o=this.tensorMap.get(t);return o.values=e,o.values}readSync(t){let e=this.tensorMap.get(t),{values:o,complexTensorInfos:n}=e;if(o!=null||e.dtype==="string")return o;if(e.dtype==="complex64"){let b=this.readSync(n.real.dataId),x=this.readSync(n.imag.dataId),C=S.convertBackendValuesAndArrayBuffer(N.mergeRealAndImagArrays(b,x).buffer,"float32");return this.convertAndCacheOnCPU(t,C),C}this.hasReadSyncWarned||(this.hasReadSyncWarned=!0,console.warn("The performance of synchronously reading data from GPU to CPU is poor on the webgpu backend, please use asynchronous APIs instead."));let s=["opaque","premultiplied"],i=e.resource,a=i.size;S.assert(a%4===0,()=>"Because there is 4 bytes for one pixel, buffer size must be multiple of 4.");let u=a/4,p=new ArrayBuffer(a),l=256,c=256,m=s.map(b=>new OffscreenCanvas(l,c)),f=new OffscreenCanvas(l,c);this.endComputePassEncoder(),m.map((b,x)=>{let C=b.getContext("webgpu");return C.configure({device:this.device,format:"bgra8unorm",usage:GPUTextureUsage.COPY_DST,alphaMode:s[x]}),C.getCurrentTexture()}).map((b,x)=>{let C=l*4,k=(z,B,H)=>{this.ensureCommandEncoderReady(),this.commandEncoder.copyBufferToTexture({buffer:i,bytesPerRow:C,offset:H},{texture:b},{width:z,height:B}),this.submitQueue();let Y=f.getContext("2d",{willReadFrequently:!0});Y.clearRect(0,0,z,B),Y.drawImage(m[x],0,0);let J=Y.getImageData(0,0,z,B).data,it=s[x],ut=new Uint8ClampedArray(p,H,z*B*4);for(let pt=0;pt<ut.length;pt+=4)if(it==="premultiplied")ut[pt+3]=J[pt+3];else{let Tt=J[pt];ut[pt]=J[pt+2],ut[pt+1]=J[pt+1],ut[pt+2]=Tt}},v=Math.floor(u/(l*c)),I=l,T=c,R=0;for(let z=0;z<v;z++)k(I,T,R),R+=l*c*4;let M=u%(l*c);T=Math.floor(M/l),T>0&&(k(I,T,R),R+=T*(l*4)),I=M%l,I>0&&k(I,1,R)});let h=S.convertBackendValuesAndArrayBuffer(p,e.dtype);return this.convertAndCacheOnCPU(t,h),h}async read(t){if(!this.tensorMap.has(t))throw new Error(`Tensor ${t} was not registered!`);let e=this.tensorMap.get(t),{values:o}=e;if(o!=null)return o;let n;if(e.dtype==="complex64"){let s=await Promise.all([this.read(e.complexTensorInfos.real.dataId),this.read(e.complexTensorInfos.imag.dataId)]),i=s[0],a=s[1];n=N.mergeRealAndImagArrays(i,a)}else{let s=await this.getBufferData(e.resource);n=S.convertBackendValuesAndArrayBuffer(s,e.dtype)}return this.convertAndCacheOnCPU(t,n),n}copyBuffer(t){let e=t.size,o=t.usage,n=this.bufferManager.acquireBuffer(e,o);return this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(t,0,n,0,e),this.submitQueue(),n}createTensorFromGPUData(t,e,o){let n=t.buffer;if(o==="complex64")throw new Error("Cannot write to a complex64 dtype. ");let s={id:this.nextDataId()};this.tensorMap.set(s,{dtype:o,shape:e,values:null,refCount:1,external:t.zeroCopy});let i=this.tensorMap.get(s),a=hm(i.dtype)*S.sizeFromShape(i.shape);if(t.buffer.size<a)throw new Error(`GPUBuffer size(${t.buffer.size}) is smaller than tensor size(${a})!`);if((t.buffer.usage&(GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC))!==(GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC))throw new Error("GPUBuffer.usage should include GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC!");return t.zeroCopy!==!0&&(n=this.copyBuffer(n)),i.resource=n,eu().makeTensorFromDataId(s,e,o,this)}readToGPU(t){let e=this.tensorMap.get(t),{values:o,dtype:n,shape:s,resource:i}=e;if(n==="complex64")throw new Error("Does not support reading buffer for complex64 dtype.");if(i==null)throw o!=null?new Error("Data is not on GPU but on CPU."):new Error("There is no data on GPU or CPU.");let a=i,u=a.size,p=a.usage,l=this.bufferManager.acquireBuffer(u,p);this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(i,0,l,0,u),this.submitQueue();let c=this.makeTensorInfo(s,n),m=eu().makeTensorFromTensorInfo(c),f=this.tensorMap.get(c.dataId);return f.resource=l,{tensorRef:m,buffer:l}}bufferSync(t){let e=this.readSync(t.dataId);if(t.dtype==="string")try{let o=e.map(n=>S.decodeString(n));return st(t.shape,t.dtype,o)}catch{throw new Error("Failed to decode encoded string bytes into utf-8")}return st(t.shape,t.dtype,e)}async time(t){!this.supportTimestampQuery&&!this.hasTimestampQueryWarned&&(console.warn("This device doesn't support timestamp-query extension. Start Chrome browser with flag --enable-dawn-features=allow_unsafe_apis to try it again. Otherwise, zero will be shown for the kernel time when profiling mode is enabled."),this.hasTimestampQueryWarned=!0);let e=this.activeTimers,o=[],n=!1;this.programTimersStack==null?(this.programTimersStack=o,n=!0):this.activeTimers.push(o),this.activeTimers=o,t();let s=S.flatten(this.activeTimers.map(p=>p.query)).filter(p=>p!=null),i=S.flatten(this.activeTimers.map(p=>p.name)).filter(p=>p!=null);this.activeTimers=e,n&&(this.programTimersStack=null);let a={uploadWaitMs:this.uploadWaitMs,downloadWaitMs:this.downloadWaitMs,kernelMs:null,wallMs:null},u=await Promise.all(s);return a.kernelMs=S.sum(u),a.getExtraProfileInfo=()=>u.map((p,l)=>({name:i[l],ms:p})).map(p=>`${p.name}: ${p.ms}`).join(", "),this.uploadWaitMs=0,this.downloadWaitMs=0,a}makeTensorInfo(t,e,o){return e==="string"&&o!=null&&o.length>0&&S.isString(o[0])&&(o=o.map(s=>S.encodeString(s))),{dataId:this.write(o,t,e),shape:t,dtype:e}}tensorToBinding(t){if(!t)return null;let o=this.tensorMap.get(t.dataId).resource;return o instanceof GPUBuffer?{buffer:o}:o instanceof GPUTexture?o.createView():o}uploadToGPU(t){let e=this.tensorMap.get(t);if(e.resource!=null)return;let o=hm(e.dtype)*S.sizeFromShape(e.shape),n,s=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST;if(e.values){if(n=this.bufferManager.acquireBuffer(o,s,!0),n.mapState==="unmapped"){let i=this.bufferManager.acquireBuffer(o,GPUBufferUsage.MAP_WRITE|GPUBufferUsage.COPY_SRC,!0,!1),a=i.getMappedRange();e.dtype==="int32"||e.dtype==="bool"?new Int32Array(a).set(e.values):new Float32Array(a).set(e.values),i.unmap(),this.ensureCommandEncoderReady(),this.endComputePassEncoder(),this.commandEncoder.copyBufferToBuffer(i,0,n,0,o),this.stagingPendingDisposal.push(i)}else{let i=n.getMappedRange();e.dtype==="int32"||e.dtype==="bool"?new Int32Array(i).set(e.values):new Float32Array(i).set(e.values),n.unmap()}e.values=null}else n=this.bufferManager.acquireBuffer(o,s);e.resource=n}makeUniforms(t){let e=0,o=0,n=[],s=1;t.forEach(u=>{u.data.length===0&&(u.data=[1]);let p;switch(u.data.length){case 1:p=4;break;case 2:p=8;break;case 3:p=16;break;case 4:p=16;break;case 5:p=16;break;case 6:p=16;break;default:S.assert(!1,()=>`Unsupported ${u.data.length}D shape`)}(o===5||o===6)&&(p=16),p>s&&(s=p),e=Math.ceil(e/p)*p,o=u.data.length,n.push(e),e+=u.data.length*4}),e=Math.ceil(e/s)*s;let i=new ArrayBuffer(e);t.forEach((u,p)=>{let l=n[p];u.type==="int32"?new Int32Array(i,l,u.data.length).set(u.data):u.type==="uint32"?new Uint32Array(i,l,u.data.length).set(u.data):new Float32Array(i,l,u.data.length).set(u.data)});let a=this.bufferManager.acquireBuffer(e,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);return this.queue.writeBuffer(a,0,i,0,e),this.uniformPendingDisposal.push(a),{offset:0,size:e,buffer:a}}runWebGPUProgram(t,e,o,n,s){if(s||(s=this.makeTensorInfo(t.outputShape,o)),S.sizeFromShape(s.shape)===0)return this.tensorMap.get(s.dataId).values=S.getTypedArrayFromDType(s.dtype,0),s;this.uploadToGPU(s.dataId),t.dispatch=oT(this.device,t);let i=e.map((u,p)=>{if(u.dtype==="complex64")throw new Error("GPGPUProgram does not support complex64 input. For complex64 dtypes, please separate the program into real and imaginary parts.");return this.uploadToGPU(u.dataId),{dtype:this.tensorMap.get(u.dataId).dtype,shape:u.shape,name:t.variableNames[p]}});t.shaderKey=Iy(t,i,s);let a=L().getBool("WEBGPU_ENGINE_COMPILE_ONLY");return t.shaderKey in this.pipelineCache||(this.pipelineCache[t.shaderKey]=ky(this.device,t,i,s,a)),t.pipeline=this.pipelineCache[t.shaderKey],a||this.recordAndSubmit(t,s,e,n),s}recordAndSubmit(t,e,o,n){if(t.pipeline instanceof Promise)throw new Error("Please call checkCompileCompletionAsync to ensure parallel compilation is done!");let s=[],i=[],a="int32";if(t.pixelsOpType==null){s.push({type:"float32",data:[NaN]},{type:"float32",data:[1/0]}),i=o.concat(e).map(f=>f.shape);let m="int32";i.map(f=>{s.push({type:m,data:f});let h=S.computeStrides(f);s.push({type:m,data:h})})}else{let m=S.computeStrides(e.shape);s.push({type:a,data:m})}if(t.size){let m=S.sizeFromShape(t.outputShape);s.push({type:a,data:[t.outputComponent?m/t.outputComponent:m]})}n&&(s=[...s,...n]);let u=[this.tensorToBinding(e),...o.map(m=>this.tensorToBinding(m)),this.makeUniforms(s)];o.forEach(m=>{this.commandQueueOwnedIds.add(m.dataId)}),this.commandQueueOwnedIds.add(e.dataId);let p=this.device.createBindGroup({layout:t.pipeline.getBindGroupLayout(0),entries:u.map((m,f)=>({binding:f,resource:m}))}),l=this.activeTimers!=null;this.ensureCommandEncoderReady();let c={};l&&this.supportTimestampQuery?(this.endComputePassEncoder(),this.querySet==null&&(this.querySet=this.device.createQuerySet({type:"timestamp",count:this.querySetCount})),c.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1},this.computePassEncoder=this.commandEncoder.beginComputePass(c)):this.computePassEncoder||(this.computePassEncoder=this.commandEncoder.beginComputePass(c)),this.computePassEncoder.setPipeline(t.pipeline),this.computePassEncoder.setBindGroup(0,p),this.computePassEncoder.dispatchWorkgroups(t.dispatch[0],t.dispatch[1],t.dispatch[2]),this.dispatchCountInPass++,(l||L().get("WEBGPU_DEFERRED_SUBMIT_BATCH_SIZE")<=this.dispatchCountInPass||t.pixelsOpType===Sr.DRAW)&&(this.endComputePassEncoder(),l?this.activeTimers.push({name:t.constructor.name,query:this.getQueryTime()}):this.submitQueue())}async getQueryTime(){if(!this.supportTimestampQuery)return 0;this.queryResolveBuffer==null&&(this.queryResolveBuffer=this.bufferManager.acquireBuffer(this.querySetCount*8,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST|GPUBufferUsage.QUERY_RESOLVE)),this.commandEncoder.resolveQuerySet(this.querySet,0,this.querySetCount,this.queryResolveBuffer,0);let t=this.bufferManager.acquireBuffer(this.querySetCount*8,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,t,0,this.querySetCount*8),this.submitQueue(),await t.mapAsync(GPUMapMode.READ);let e=new BigUint64Array(t.getMappedRange()),o=Number(e[1]-e[0])/1e6;return t.unmap(),this.bufferManager.releaseBuffer(t),o}shouldExecuteOnCPU(t,e=rT){return L().getBool("WEBGPU_CPU_FORWARD")&&t.every(o=>this.tensorMap.get(o.dataId).resource==null&&S.sizeFromShape(o.shape)<e)}numDataIds(){return this.tensorMap.numDataIds()-this.tensorDataPendingDisposal.length}dispose(){this.disposed||(this.querySet!=null&&this.querySet.destroy(),this.bufferManager.dispose(),this.textureManager.dispose(),this.disposed=!0)}};Es.nextDataId=0;Lu()&&Ad("webgpu",async()=>{let r={powerPreference:L().get("WEBGPU_USE_LOW_POWER_GPU")?"low-power":"high-performance"},t=await navigator.gpu.requestAdapter(r),e={},o=[];t.features.has("timestamp-query")&&o.push("timestamp-query"),t.features.has("bgra8unorm-storage")&&o.push(["bgra8unorm-storage"]),e.requiredFeatures=o;let n=t.limits;e.requiredLimits={maxComputeWorkgroupStorageSize:n.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:n.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:n.maxStorageBufferBindingSize,maxBufferSize:n.maxBufferSize,maxComputeWorkgroupSizeX:n.maxComputeWorkgroupSizeX,maxComputeInvocationsPerWorkgroup:n.maxComputeInvocationsPerWorkgroup};let s=await t.requestDevice(e),i="info"in t?t.info:"requestAdapterInfo"in t?await t.requestAdapterInfo():void 0;return new Es(s,i)},3);var q;(function(r){r[r.ADD=0]="ADD",r[r.ATAN2=1]="ATAN2",r[r.COMPLEX_MULTIPLY_IMAG=2]="COMPLEX_MULTIPLY_IMAG",r[r.COMPLEX_MULTIPLY_REAL=3]="COMPLEX_MULTIPLY_REAL",r[r.DIV=4]="DIV",r[r.ELU_DER=5]="ELU_DER",r[r.EQUAL=6]="EQUAL",r[r.FLOOR_DIV=7]="FLOOR_DIV",r[r.GREATER=8]="GREATER",r[r.GREATER_EQUAL=9]="GREATER_EQUAL",r[r.LESS=10]="LESS",r[r.LESS_EQUAL=11]="LESS_EQUAL",r[r.LOGICAL_AND=12]="LOGICAL_AND",r[r.LOGICAL_OR=13]="LOGICAL_OR",r[r.MAX=14]="MAX",r[r.MIN=15]="MIN",r[r.MOD=16]="MOD",r[r.MUL=17]="MUL",r[r.NOT_EQUAL=18]="NOT_EQUAL",r[r.POW=19]="POW",r[r.PRELU=20]="PRELU",r[r.SQUARED_DIFFERENCE=21]="SQUARED_DIFFERENCE",r[r.SUB=22]="SUB"})(q||(q={}));var nT="let resultTemp = a + b;",sT="let resultTemp = atan2(a, b);",iT="let resultTemp = areal * breal - aimag * bimag;",aT="let resultTemp = areal * bimag + aimag * breal;",uT="let resultTemp = a / b;",pT="let resultTemp = select(a * (b + 1.0), a, b >= b - b);",lT=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a == b);
`,cT=`
  let remainder =
      select(a % b, round(a % b), (round(a) == a) & (round(b) == b));
  let quotient = (a - remainder) / b;
  let resultTemp =
      round(select(quotient, quotient - 1, sign(remainder) == -sign(b)));
`,mT=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a > b);
`,fT=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a >= b);
`,dT=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a < b);
`,hT=`
  let zero = sign(a) * 0 + 0;
  let one = sign(b) * 0 + 1;
  let resultTemp = select(zero, one, a <= b);
`,gT="return f32(a >= 1.0 && b >= 1.0);",xT=`return (vec4<f32>(a >= vec4<f32>(1.0)) *
  vec4<f32>(b >= vec4<f32>(1.0)));`,yT="return f32(a >= 1.0 || b >= 1.0);",bT=`return min(vec4<f32>(a >= vec4<f32>(1.0)) +
  vec4<f32>(b >= vec4<f32>(1.0)), vec4<f32>(1.0));`,wT="let resultTemp = max(a, b);",ST="let resultTemp = min(a, b);",CT=`
  let isNaN = b == 0.;
  var resultTemp = a % b;
  resultTemp = select((resultTemp + b) % b, resultTemp,
      (a < 0. && b < 0.) || (a >= 0. && b > 0.));
`,vT=`
  let isNaN = !vec4<bool>(b);
  var resultTemp = vec4<f32>(a % b);
  if (!((a[0] < 0. && b[0] < 0.) || (a[0] >= 0. && b[0] > 0.))) {
    resultTemp[0] = (resultTemp[0] + b[0]) % b[0];
  }
  if (!((a[1] < 0. && b[1] < 0.) || (a[1] >= 0. && b[1] > 0.))) {
    resultTemp[1] = (resultTemp[1] + b[1]) % b[1];
  }
  if (!((a[2] < 0. && b[2] < 0.) || (a[2] >= 0. && b[2] > 0.))) {
    resultTemp[2] = (resultTemp[2] + b[2]) % b[2];
  }
  if (!((a[3] < 0. && b[3] < 0.) || (a[3] >= 0. && b[3] > 0.))) {
    resultTemp[3] = (resultTemp[3] + b[3]) % b[3];
  }
`,kT="let resultTemp = a * b;",IT=`
  var resultTemp = f32(a != b);
  let valueForNaN = 1.0;
`,ET=`
  var resultTemp = vec4<f32>(a != b);
  let valueForNaN = 1.0;
`,$T=`
  let isNaN = a < 0.0 && floor(b) < b;
  if (b == 0.0) {
    return 1.0;
  }
  var resultTemp = select(sign(a) * pow(abs(a), b), pow(abs(a), b),
      round(abs(b) % 2.0) != 1.0);
`,NT=`
  let isModRound1Bool = vec4<i32>(round(abs(b) % vec4<f32>(2.0))) == vec4<i32>(1);
  let isModRound1 = vec4<f32>(isModRound1Bool);
  let multiplier = sign(a) * isModRound1 + (vec4<f32>(1.0) - isModRound1);
  var resultTemp = multiplier * pow(abs(a), b);

  // Ensure that a^0 = 1, including 0^0 = 1 as this correspond to TF and JS
  let isExpZero = b == vec4<f32>(0.0);
  if (isExpZero.r) {
    resultTemp.r = 1.0;
  }
  if (isExpZero.g) {
    resultTemp.g = 1.0;
  }
  if (isExpZero.b) {
    resultTemp.b = 1.0;
  }
  if (isExpZero.a) {
    resultTemp.a = 1.0;
  }
  let isNaN = (a < vec4<f32>(0.0)) & (floor(b) < b);
`,TT="if (a < 0.0) { return b * a; }  return a;",DT=`
  let aLessThanZero = vec4<f32>(a < vec4<f32>(0.0));
  return (aLessThanZero * (b * a)) + ((vec4<f32>(1.0) - aLessThanZero) * a);
`,AT="let resultTemp = (a - b) * (a - b);",RT="let resultTemp = a - b;";function $s(r,t){let e;do{switch(r){case q.ATAN2:e=sT;break;case q.MAX:e=wT;break;case q.MIN:e=ST;break;case q.MOD:e=t?vT:CT;break;case q.NOT_EQUAL:e=t?ET:IT;break;case q.POW:e=t?NT:$T;break;default:continue}let o,n,s;return t?(o="isnanVec4",n="vec4<f32>",s="vec4<bool>"):(o="isnan",n="f32",s="bool"),`
      let aIsNaN = ${o}(a);
      let aPostLegalization = select(a, ${n}(42), aIsNaN);
      let bIsNaN = ${o}(b);
      let bPostLegalization = select(b, ${n}(42), bIsNaN);
      let isNaN = false;
      let valueForNaN = uniforms.NAN;
      {
        let a = aPostLegalization;
        let b = bPostLegalization;
        ${e}
        return select(
            resultTemp, ${n}(valueForNaN),
            ${s}(isNaN) | aIsNaN | bIsNaN);
      }
    `}while(!1);switch(r){case q.ADD:e=nT;break;case q.COMPLEX_MULTIPLY_IMAG:e=aT;break;case q.COMPLEX_MULTIPLY_REAL:e=iT;break;case q.DIV:e=uT;break;case q.ELU_DER:e=pT;break;case q.EQUAL:e=lT;break;case q.FLOOR_DIV:e=cT;break;case q.GREATER:e=mT;break;case q.GREATER_EQUAL:e=fT;break;case q.LESS:e=dT;break;case q.LESS_EQUAL:e=hT;break;case q.LOGICAL_AND:return t?xT:gT;case q.LOGICAL_OR:return t?bT:yT;case q.MUL:e=kT;break;case q.PRELU:return t?DT:TT;case q.SQUARED_DIFFERENCE:e=AT;break;case q.SUB:e=RT;break;default:}return`
    ${e}
    return resultTemp;
  `}var P;(function(r){r[r.ABS=0]="ABS",r[r.ACOS=1]="ACOS",r[r.ACOSH=2]="ACOSH",r[r.ASIN=3]="ASIN",r[r.ASINH=4]="ASINH",r[r.ATAN=5]="ATAN",r[r.ATANH=6]="ATANH",r[r.CEIL=7]="CEIL",r[r.COS=8]="COS",r[r.COSH=9]="COSH",r[r.ELU=10]="ELU",r[r.ERF=11]="ERF",r[r.EXP=12]="EXP",r[r.EXPM1=13]="EXPM1",r[r.FLOOR=14]="FLOOR",r[r.IS_FINITE=15]="IS_FINITE",r[r.IS_INF=16]="IS_INF",r[r.IS_NAN=17]="IS_NAN",r[r.LINEAR=18]="LINEAR",r[r.LOG=19]="LOG",r[r.LOG1P=20]="LOG1P",r[r.LOGICAL_NOT=21]="LOGICAL_NOT",r[r.NEG=22]="NEG",r[r.RELU=23]="RELU",r[r.RELU6=24]="RELU6",r[r.LEAKYRELU=25]="LEAKYRELU",r[r.RECIPROCAL=26]="RECIPROCAL",r[r.ROUND=27]="ROUND",r[r.RSQRT=28]="RSQRT",r[r.SELU=29]="SELU",r[r.SIGMOID=30]="SIGMOID",r[r.SIGN=31]="SIGN",r[r.SIN=32]="SIN",r[r.SINH=33]="SINH",r[r.SOFTPLUS=34]="SOFTPLUS",r[r.SQRT=35]="SQRT",r[r.SQUARE=36]="SQUARE",r[r.STEP=37]="STEP",r[r.TAN=38]="TAN",r[r.TANH=39]="TANH",r[r.TO_INT=40]="TO_INT"})(P||(P={}));var FT="return abs(a);",PT=`
  if (abs(a) > 1.) {
    return uniforms.NAN;
  }
  return acos(a);
`,MT=`
  if (a < 1.) {
    return uniforms.NAN;
  }
  return acosh(a);
`,_T=`
  if (abs(a) > 1.) {
    return uniforms.NAN;
  }
  return asin(a);
`,BT="return asinh(a);",zT=`
  if (isnan(a)) {
    return uniforms.NAN;
  }
  return atan(a);
`,LT=`
  if (abs(a) > 1.) {
    return uniforms.NAN;
  }
  if (a == 1.) {
    return uniforms.INFINITY;
  }
  if (a == -1.) {
    return -uniforms.INFINITY;
  }
  return atanh(a);
`,GT="return ceil(a);",OT="return cos(a);",WT=`
  let e2x = exp(-a);
  return (e2x + 1.0 / e2x) / 2.0;
`,UT="return exp(a) - 1.0;",VT="if (a >= 0.0) { return a; }  return (exp(a) - 1.0);",HT=`
  var resFloat = exp(a) - vec4<f32>(1.0);
  if (a.r >= 0.0) {
    resFloat.r = a.r;
  }
  if (a.g >= 0.0) {
    resFloat.g = a.g;
  }
  if (a.b >= 0.0) {
    resFloat.b = a.b;
  }
  if (a.a >= 0.0) {
    resFloat.a = a.a;
  }
  return resFloat;
`,qT=`
  // Error function is calculated approximately with elementary function.
  // See "Handbook of Mathematical Functions with Formulas,
  // Graphs, and Mathematical Tables", Abramowitz and Stegun.
  let p = ${N.ERF_P};
  let a1 = ${N.ERF_A1};
  let a2 = ${N.ERF_A2};
  let a3 = ${N.ERF_A3};
  let a4 = ${N.ERF_A4};
  let a5 = ${N.ERF_A5};

  let sign = sign(a);
  let absA = abs(a);
  let t = 1.0 / (1.0 + p * absA);
  return sign * (1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * exp(-absA * absA));
`,KT="return exp(a);",XT="return floor(a);",jT="return f32(!isnan(a) && !isinf(a));",YT="return f32(isinf(a));",ZT="return f32(isnan(a));",QT="return a;",JT=`if (a < 0.0) { return uniforms.NAN; }
  return log(a);`,tD=`
  if (isnan(a)) { return a; }
  return log(1.0 + a);
`,eD="return f32(!(a >= 1.0));",rD="return -a;",oD="if (a < 0.0) { return uniforms.alpha * a; } return a;",nD=`
  let aLessThanZero = vec4<f32>(a < vec4<f32>(0.0));
  return (aLessThanZero * (uniforms.alpha * a)) + ((vec4<f32>(1.0) - aLessThanZero) * a);
`,sD="return 1.0 / a;",iD="return select(a, 0.0, a < 0.0);",aD="return clamp(a, 0.0, 6.0);",uD="return clamp(a, vec4<f32>(0.0, 0.0, 0.0, 0.0), vec4<f32>(6.0, 6.0, 6.0, 6.0));",pD=`
  return select(a, vec4<f32>(0.0), a < vec4<f32>(0.0));
`,lD="return round(a);",cD="return inverseSqrt(a);",mD=`
  if (a >= 0.0) {
    return ${N.SELU_SCALE} * a;
  } else {
    return ${N.SELU_SCALEALPHA} * (exp(a) - 1.0);
  }
`,fD="return 1.0 / (1.0 + exp(-1.0 * a));",dD="return sign(a);",hD="return sin(a);",gD=`
  let e2x = exp(a);
  return (e2x - 1.0 / e2x) / 2.0;
`,xD=`
  let epsilon = 1.1920928955078125e-7;
  let threshold = log(epsilon) + 2.0;

  let too_large = a > -threshold;
  let too_small = a < threshold;
  let exp_a = exp(a);

  if (too_large) {
    return a;
  } else if (too_small) {
    return exp_a;
  } else {
    return log(exp_a + 1.0);
  }
`,yD="return sqrt(a);",bD="return a * a;",wD=`
  if (isnan(a)) {
    return a;
  }

  return select(uniforms.stepAlpha, 1.0, a > 0.0);
`,SD="return tan(a);",CD=`
  let e2x = exp(-2.0 * abs(a));
  return sign(a) * (1.0 - e2x) / (1.0 + e2x);
`,vD="return f32(i32((a)));";function Cr(r,t){switch(r){case P.ABS:return FT;case P.ACOS:return PT;case P.ACOSH:return MT;case P.ASIN:return _T;case P.ASINH:return BT;case P.ATAN:return zT;case P.ATANH:return LT;case P.COS:return OT;case P.COSH:return WT;case P.CEIL:return GT;case P.ELU:return t?HT:VT;case P.ERF:return qT;case P.EXP:return KT;case P.EXPM1:return UT;case P.FLOOR:return XT;case P.IS_FINITE:return jT;case P.IS_INF:return YT;case P.IS_NAN:return ZT;case P.LINEAR:return QT;case P.LOG:return JT;case P.LOG1P:return tD;case P.LOGICAL_NOT:return eD;case P.NEG:return rD;case P.LEAKYRELU:return t?nD:oD;case P.RECIPROCAL:return sD;case P.RELU:return t?pD:iD;case P.RELU6:return t?uD:aD;case P.ROUND:return lD;case P.RSQRT:return cD;case P.SELU:return mD;case P.SIGMOID:return fD;case P.SIGN:return dD;case P.SIN:return hD;case P.SINH:return gD;case P.SOFTPLUS:return xD;case P.SQRT:return yD;case P.SQUARE:return bD;case P.STEP:return wD;case P.TAN:return SD;case P.TANH:return CD;case P.TO_INT:return vD;default:throw new Error(`BinaryType ${r} is not implemented!`)}}function Vt(r,t=!1,e=!1,o=3){if(r===null)return"";let n="";if(r==="linear")n=Cr(P.LINEAR);else if(r==="relu")n=Cr(P.RELU,e);else if(r==="elu")n=Cr(P.ELU,e);else if(r==="relu6")n=Cr(P.RELU6,e);else if(r==="prelu")n=$s(q.PRELU,e);else if(r==="sigmoid")n=Cr(P.SIGMOID,e);else if(r==="leakyrelu")n=Cr(P.LEAKYRELU,e);else throw new Error(`Activation ${r} has not been implemented for the WebGPU backend.`);let i=et(e?4:1),a="";return t?a=`
      fn activation(a : ${i}, coords : vec${o}<i32>) -> ${i} {
        let b = getPreluActivationWeightsByOutputCoords(coords);
        ${n}
      }`:a=`
      fn activation(a : ${i}, coords : vec${o}<i32>) -> ${i} {
        ${n}
      }`,a}function le(r,t){return`
      ${r?"value = value + getBiasByOutputCoords(coords);":""}
      ${t?"value = activation(value, coords);":""}
      `}function gm(r,t,e=!1,o=!1,n=!1,s=1){S.assert(r&&s===1||!r,()=>`transposeA ${r} is not compatible with component size ${s}`);let i=`
      ${r?"value = getA(batch, col, row);":"value = getA(batch, row, col);"}

    `,a=t?"value = getB(batch, col, row);":"value = getB(batch, row, col);";return`
  fn mm_readA(batch: i32, row: i32, col: i32) -> ${et(s)} {
    var value = ${et(s)}(0.0);
    ${e&&n?i:`
    ${r?"if(row < uniforms.dimAOuter && col < uniforms.dimInner)":"if(row < uniforms.aShape[1] && col < uniforms.aShape[2])"}
    {
      ${i}
    }
    `}
    return value;
  }

  fn mm_readB(batch: i32, row: i32, col: i32) -> ${et(s)} {
    var value = ${et(s)}(0.0);
    ${a}
    return value;
  }
  `}function Ii(r,t,e,o,n=!1,s=!1,i=!1,a=1){return`
  ${gm(e,o,n,s,i,a)}
  fn mm_write(batch: i32, row: i32, col: i32, valueIn: ${et(a)}) {
    ${n&&s?"":"if (row < uniforms.dimAOuter && col < uniforms.dimBOuter)"}
    {
      var value = valueIn;
      let coords = vec3<i32>(batch, row, col);
      ${le(r,t)}
      setOutputAtCoords(coords[0], coords[1], coords[2], value);
    }
  }
  `}var kD=(r,t)=>r?`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          kStart + inputRow,
          globalRowStart + inputCol * ${t});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          globalRow + innerRow,
          kStart + inputCol * ${t});
        `,ID=(r,t,e,o)=>{if(r)return`
      for (var k = 0; k < ${o}; k++) {
        let BCached0 = mm_Bsub[k][tileCol];
        let ACached0 = mm_Asub[k][localRow];
        for (var i = 0; i < ${e}; i++) {
          acc[i] = fma(BCached0, vec4<f32>(ACached0[i]), acc[i]);
        }
      }`;{let n="",s="";for(let i=0;i<t;i++)n+=`let BCached${i} = mm_Bsub[k * ${t} + ${i}][tileCol];`,s+=`acc[i] = fma(BCached${i}, vec4<f32>(ACached[${i}]), acc[i]);`;return`
      for (var k = 0; k < ${o/t}; k++) {
        ${n}
        for (var i = 0; i < ${e}; i++) {
          let ACached = mm_Asub[tileRow + i][k];
          ${s}
        }
      }`}};function Ao(r,t,e=!1,o=32,n=!1,s=32,i=!1){let a=t[1]*r[1],u=t[0]*r[0],p=e?a:o,l=e?o:a,c=p/t[0],m=o/t[1],f=r[1],h=r[0];return S.assert((e&&c===4&&r[1]===4||!e&&(c===3||c===4))&&p%t[0]===0&&o%t[1]===0&&r[0]===4,()=>`If transposeA ${e} is true, innerElementSize ${c} and workPerThread[1] ${r[1]} must be 4.
          Otherwise, innerElementSize ${c} must be 3 or 4.
      tileAWidth ${p} must be divisible by workgroupSize[0]${t[0]}. tileInner ${o} must be divisible by workgroupSize[1] ${t[1]}. colPerThread ${r[0]} must be 4.`),`
  var<workgroup> mm_Asub : array<array<vec${c}<f32>, ${p/c}>, ${l}>;
  var<workgroup> mm_Bsub : array<array<vec4<f32>, ${u/r[0]}>, ${o}>;

  ${D()} {
    let localRow = i32(localId.y);
    let tileRow = localRow * ${f};
    let tileCol = i32(localId.x);

    let globalRow = i32(globalId.y) * ${f};
    let globalCol = i32(globalId.x) * ${h};
    let batch = ${n?"0":"i32(globalId.z)"};
    let batchA = ${n||!i?"batch":"batch % uniforms.aShape[0]"};
    let batchB = ${n||!i?"batch":"batch % uniforms.bShape[0]"};
    let globalRowStart = i32(workgroupId.y) * ${a};

    let numTiles = ${n?`${Math.ceil(s/o)}`:`(uniforms.dimInner - 1) / ${o} + 1`};
    var kStart = ${n?`i32(globalId.z) * ${s}`:"0"};

    var acc: array<vec4<f32>, ${f}>;

    // Loop over shared dimension.
    let tileRowB = localRow * ${m};
    for (var t = 0; t < numTiles; t++) {
        // Load one tile of A into local memory.
        for (var innerRow = 0; innerRow < ${f}; innerRow++) {
            let inputRow = tileRow + innerRow;
            let inputCol = tileCol;
            ${kD(e,c)}
        }

        // Load one tile of B into local memory.
        for (var innerRow = 0; innerRow < ${m}; innerRow++) {
            let inputRow = tileRowB + innerRow;
            let inputCol = tileCol;
            mm_Bsub[inputRow][inputCol] = mm_readB(batchB, kStart + inputRow, globalCol);
        }
        kStart = kStart + ${o};
        workgroupBarrier();

        // Compute acc values for a single thread.
        ${ID(e,c,f,o)}
        workgroupBarrier();
    }

    for (var innerRow = 0; innerRow < ${f}; innerRow++) {
        mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
    }
  }`}var Ty=r=>r?`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          kStart + inputRow,
          globalRowStart + inputCol);
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batchA,
          globalRowStart + inputRow,
          kStart + inputCol);
        `,ED=r=>r?"let ACached = mm_Asub[k][tileRow + innerRow];":"let ACached = mm_Asub[tileRow + innerRow][k];";function Ro(r,t,e=!1,o=32,n=!1,s=32,i=!1,a=!1){let u=r[1]*t[1],p=r[0]*t[0],l=e?u:o,c=e?o:u;S.assert(c%t[1]===0&&l%t[0]===0&&o%t[1]===0,()=>`tileAHight ${c} must be divisible by workgroupSize[1]${t[1]}, tileAWidth ${l} must be divisible by workgroupSize[0]${t[0]}, tileInner ${o} must be divisible by workgroupSize[1]${t[1]}`);let m=c/t[1],f=l/t[0],h=o/t[1],b=r[1],x=r[0],C=i?`
      let localRow = i32(localId.y);
      let localCol = i32(localId.x);
      let globalRowStart = i32(workgroupId.y) * ${u};
      let globalColStart = i32(workgroupId.x) * ${p};

      // Loop over shared dimension.
      for (var t = 0; t < numTiles; t++) {
        // Load one tile of A into local memory.
        for (var inputRow = localRow; inputRow < ${c}; inputRow = inputRow + ${t[1]}) {
          for (var inputCol = localCol; inputCol < ${l}; inputCol = inputCol + ${t[0]}) {
            ${Ty(e)}
          }
        }
        // Load one tile of B into local memory.
        for (var inputRow = localRow; inputRow < ${o}; inputRow = inputRow + ${t[1]}) {
              for (var inputCol = localCol; inputCol < ${p}; inputCol = inputCol + ${t[0]}) {
            mm_Bsub[inputRow][inputCol] = mm_readB(batchB,
              kStart + inputRow,
              globalColStart + inputCol);
          }
        }
        kStart = kStart + ${o};
        workgroupBarrier();

        // Compute acc values for a single thread.
        var BCached : array<f32, ${x}>;
        for (var k = 0; k < ${o}; k++) {
          for (var inner = 0; inner < ${x}; inner++) {
            BCached[inner] = mm_Bsub[k][localCol + inner * ${t[0]}];
          }
          for (var innerRow = 0; innerRow < ${b}; innerRow++) {
            let ACached = ${e?`mm_Asub[k][localRow + innerRow * ${t[1]}];`:`mm_Asub[localRow + innerRow * ${t[1]}][k];`}
            for (var innerCol = 0; innerCol < ${x}; innerCol++) {
              acc[innerRow][innerCol] =
                  fma(ACached, BCached[innerCol], acc[innerRow][innerCol]);
            }
          }
        }
        workgroupBarrier();
      }
      for (var innerRow = 0; innerRow < ${b}; innerRow++) {
        let gRow = globalRowStart + localRow + innerRow * ${t[1]};
        for (var innerCol = 0; innerCol < ${x}; innerCol++) {
          let gCol = globalColStart + localCol + innerCol * ${t[0]};
          mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
        }
      }
      `:`
  let tileRow = i32(localId.y) * ${b};
  let tileCol = i32(localId.x) * ${x};

  let globalRow = i32(globalId.y) * ${b};
  let globalCol = i32(globalId.x) * ${x};
  let globalRowStart = i32(workgroupId.y) * ${u};

  let tileRowA = i32(localId.y) * ${m};
  let tileColA = i32(localId.x) * ${f};
  let tileRowB = i32(localId.y) * ${h};
  // Loop over shared dimension.
  for (var t = 0; t < numTiles; t++) {
    // Load one tile of A into local memory.
    for (var innerRow = 0; innerRow < ${m}; innerRow++) {
      for (var innerCol = 0; innerCol < ${f}; innerCol++) {
        let inputRow = tileRowA + innerRow;
        let inputCol = tileColA + innerCol;
        ${Ty(e)}
      }
    }

    // Load one tile of B into local memory.
    for (var innerRow = 0; innerRow < ${h}; innerRow++) {
      for (var innerCol = 0; innerCol < ${x}; innerCol++) {
        let inputRow = tileRowB + innerRow;
        let inputCol = tileCol + innerCol;
        mm_Bsub[inputRow][inputCol] = mm_readB(batchB,
          kStart + inputRow,
          globalCol + innerCol);
      }
    }
    kStart = kStart + ${o};
    workgroupBarrier();

    // Compute acc values for a single thread.
    var BCached : array<f32, ${x}>;
    for (var k = 0; k < ${o}; k++) {
      for (var inner = 0; inner < ${x}; inner++) {
        BCached[inner] = mm_Bsub[k][tileCol + inner];
      }

      for (var innerRow = 0; innerRow < ${b}; innerRow++) {
        ${ED(e)}
        for (var innerCol = 0; innerCol < ${x}; innerCol++) {
          acc[innerRow][innerCol] =
              fma(ACached, BCached[innerCol], acc[innerRow][innerCol]);
        }
      }
    }

    workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < ${b}; innerRow++) {
    for (var innerCol = 0; innerCol < ${x}; innerCol++) {
      mm_write(batch, globalRow + innerRow, globalCol + innerCol,
          acc[innerRow][innerCol]);
    }
  }
  `;return`
    var<workgroup> mm_Asub : array<array<f32, ${l}>, ${c}>;
    var<workgroup> mm_Bsub : array<array<f32, ${p}>, ${o}>;

    ${D()} {
      let batch = ${n?"0":"i32(globalId.z)"};
      let batchA = ${n||!a?"batch":"batch % uniforms.aShape[0]"};
      let batchB = ${n||!a?"batch":"batch % uniforms.bShape[0]"};
      let numTiles = ${n?`${Math.ceil(s/o)}`:`(uniforms.dimInner - 1) / ${o} + 1`};
      var kStart = ${n?`i32(globalId.z) * ${s}`:"0"};

      var acc : array<array<f32, ${x}>, ${b}>;

      // Without this initialization strange values show up in acc.
      for (var innerRow = 0; innerRow < ${b}; innerRow++) {
        for (var innerCol = 0; innerCol < ${x}; innerCol++) {
          acc[innerRow][innerCol] = 0.0;
        }
      }
      ${C}
    }
  `}var $D=r=>r?`
      mm_readA(batchA, colA, globalRow),
      mm_readA(batchA, colA + 1, globalRow),
      mm_readA(batchA, colA + 2, globalRow),
      mm_readA(batchA, colA + 3, globalRow)
  `:`
      mm_readA(batchA, globalRow, colA),
      mm_readA(batchA, globalRow, colA + 1),
      mm_readA(batchA, globalRow, colA + 2),
      mm_readA(batchA, globalRow, colA + 3)
  `;function ND(r,t=!1){S.assert(r[1]===1&&r[2]===1,()=>`A linear work group size is required. But got ${r}.`);let e=r[0]*4;return`
    var<workgroup> mm_Asub : array<vec4<f32>, ${r[0]}>;

    ${D()} {
      let tileCol = i32(localId.x);
      let globalCol = i32(globalId.x);
      let globalRow = i32(globalId.y);

      let numTiles = (uniforms.dimInner - 1) / ${e} + 1;
      let batch = i32(globalId.z);
      let batchA = batch % uniforms.aShape[0];
      let batchB = batch % uniforms.bShape[0];
      // Without this initialization strange values show up in acc.
      var acc = 0.0;

      // Loop over shared dimension.
      for (var t = 0; t < numTiles; t++) {
        // Load one tile of A into local memory.
        let colA = t * ${e} + tileCol * 4;
        mm_Asub[tileCol] = vec4<f32>(${$D(t)});
        workgroupBarrier();

        // Compute acc values for a single thread.
        for (var k = 0; k < ${e/4}; k++) {
          let rowB = t * ${e} + k * 4;
          let BCached = vec4<f32>(mm_readB(batchB, rowB, globalCol),
                              mm_readB(batchB, rowB + 1, globalCol),
                              mm_readB(batchB, rowB + 2, globalCol),
                              mm_readB(batchB, rowB + 3, globalCol));

          let ACached = mm_Asub[k];
          acc = acc + dot(ACached, BCached);
        }

        workgroupBarrier();
      }

      mm_write(batch, globalRow, globalCol, acc);
    }
  `}var Ou=class{constructor(t,e,o=!1,n=!1,s=null,i=null,a=null,u=!1){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.outputShape=e,this.dispatchLayout={x:[2],y:[1],z:[0]};let p=o?t[1]:t[2];if(this.isVec4=(p%4===0&&!o||e[1]%4===0&&o)&&e[2]%4===0&&!n,this.outputComponent=this.isVec4?4:1,this.isVectorA=e[1]===1&&!o,!this.isVec4&&this.isVectorA)this.elementsPerThread=[1,1,1],this.workgroupSize=[32,1,1];else{let m=$y(e[1],p,e[2],o);this.workgroupSize=m.workgroupSize,this.elementsPerThread=m.elementsPerThread}this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,this.elementsPerThread);let l=s!=null,c=a!=null;l&&this.variableNames.push("bias"),c&&this.variableNames.push("preluActivationWeights"),this.sequentialAccessByThreads=u,this.transposeA=o,this.transposeB=n,this.addBias=l,this.activation=i,this.hasPreluActivationWeights=c,[this.fitAOuter,this.fitBOuter,this.fitInner]=this.getShapeFit(e[1],e[2],p),this.shaderKey=`matMulPacked_${this.elementsPerThread}_${o}_${n}_${this.activation}_${this.fitAOuter}_${this.fitBOuter}_${this.fitInner}_${this.isVec4}_${this.isVectorA}_${this.sequentialAccessByThreads}`}getShapeFit(t,e,o){let n=this.workgroupSize[1]*this.elementsPerThread[1],s=this.workgroupSize[0]*this.elementsPerThread[0];!this.isVec4&&this.isVectorA?this.tileInner=this.workgroupSize[0]*4:this.tileInner=s;let i=t%n===0,a=e%s===0,u=o%this.tileInner===0;return[i,a,u]}getUserCode(){return`
      ${Vt(this.activation,this.hasPreluActivationWeights,this.isVec4)}
      ${Ii(this.addBias,this.activation,!1,this.transposeB,this.fitAOuter,this.fitBOuter,this.fitInner,this.isVec4?4:1)}
      ${this.isVec4?Ao(this.elementsPerThread,this.workgroupSize,this.transposeA,this.tileInner,!1,null,!0):this.isVectorA?ND(this.workgroupSize,this.transposeA):Ro(this.elementsPerThread,this.workgroupSize,this.transposeA,this.tileInner,!1,null,this.sequentialAccessByThreads,!0)}
    `}};function TD(r){return`
    var<workgroup> sumValues : array<f32, ${r}>;
    ${D()} {
      let coords = getOutputCoords();
      let batch = coords[0];
      let batchA = batch % uniforms.aShape[0];
      let batchB = batch % uniforms.bShape[0];
      let row = coords[1];
      let col = coords[2];
      var sum = 0.0;
      let Length = uniforms.dimInner;
      for (var k = i32(localId.x); k < Length; k = k + ${r}) {
        let dataA = mm_readA(batchA, row, k);
        let dataB = mm_readB(batchB, k, col);
        sum = sum + dataA * dataB;
      }
      sumValues[localId.x] = sum;
      workgroupBarrier();

      for(var currentSize = ${r/2}u; currentSize > 1u;
          currentSize = currentSize / 2u) {
        if (localId.x < currentSize)
        {
          sumValues[localId.x] = sumValues[localId.x] + sumValues[localId.x + currentSize];
        }
        workgroupBarrier();
      }

      if (localId.x == 0u) {
        sum = sumValues[0] + sumValues[1];
        mm_write(batch, row, col, sum);
      }
    }
  `}var Wu=class{constructor(t,e=!1,o=!1,n=null,s=null,i=null){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.workgroupSize=[256,1,1],this.outputShape=t,this.dispatchLayout={x:[],y:[1,2],z:[0]},this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize);let a=n!=null,u=i!=null;a&&this.variableNames.push("bias"),u&&this.variableNames.push("preluActivationWeights"),this.transposeA=e,this.transposeB=o,this.addBias=a,this.activation=s,this.hasPreluActivationWeights=u,this.shaderKey=`matMulReduce_${this.activation}_${e}_${o}`}getUserCode(){return`
      ${Vt(this.activation,this.hasPreluActivationWeights)}
      ${Ii(this.addBias,this.activation,this.transposeA,this.transposeB)}
      ${TD(this.workgroupSize[0])}
    `}};function DD(r){let t=r[1],e=r[0],o=t>e?t:e;return`
  var<workgroup> mm_Asub : array<array<f32, ${o}>, ${t}>;
  var<workgroup> mm_Bsub : array<array<f32, ${e}>, ${o}>;

  // If the output size is small for matrix multiplication, avoid to use vec4
  // and handle some elements per thread to optimally utilize the ALU.
  // Read data from global memory to registers firstly, then store them into
  // shared memory, so it is instruction-Level parallelism for arithmetic
  // operations and others handle IO operations between barrier api, makes ALU
  // and load/store units work simultaneously, could improves the performance.
  ${D()} {
    let tileRow = i32(localId.y);
    let tileCol = i32(localId.x);
    let globalRow = i32(globalId.y);
    let globalCol = i32(globalId.x);
    let batch = i32(globalId.z);
    let batchA = batch % uniforms.aShape[0];
    let batchB = batch % uniforms.bShape[0];

    // uniforms.dimInner should be greater than 0.
    let numTiles = (uniforms.dimInner - 1) / ${o} + 1;
    var acc = 0.0;

    var globalColA = tileCol;
    var globalRowB = 0;
    var regA = mm_readA(batchA, globalRow, globalColA);
    var regB0 = mm_readB(batchB, globalRowB + 2 * tileRow, globalCol);
    var regB1 = mm_readB(batchB, globalRowB + 2 * tileRow + 1, globalCol);
    globalColA = globalColA + ${o};
    globalRowB = globalRowB + ${o};

    for (var t = 0; t < numTiles; t = t + 1) {
      mm_Asub[tileRow][tileCol] = regA;
      mm_Bsub[2 * tileRow][tileCol] = regB0;
      mm_Bsub[2 * tileRow + 1][tileCol] = regB1;

      workgroupBarrier();

      regA = mm_readA(batchA, globalRow, globalColA);
      regB0 = mm_readB(batchB, globalRowB + 2 * tileRow, globalCol);
      regB1 = mm_readB(batchB, globalRowB + 2 * tileRow + 1, globalCol);
      globalColA = globalColA + ${o};
      globalRowB = globalRowB + ${o};

      for (var k = 0; k < ${o}; k = k + 1) {
        acc = acc + mm_Asub[tileRow][k] * mm_Bsub[k][tileCol];
      }
      workgroupBarrier();
    }

    mm_write(batch, globalRow, globalCol, acc);
  }
  `}var Uu=class{constructor(t,e,o,n=!1,s=!1,i=null,a=null,u=null){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.workgroupSize=[16,8,1],this.outputShape=o,this.dispatchLayout={x:[2],y:[1],z:[0]},this.dispatch=[Math.ceil(o[2]/this.workgroupSize[0]),Math.ceil(o[1]/this.workgroupSize[1]),o[0]];let p=i!=null;p&&this.variableNames.push("bias");let l=u!=null;l&&this.variableNames.push("preluActivationWeights"),this.transposeA=n,this.transposeB=s,this.addBias=p,this.activation=a,this.hasPreluActivationWeights=l,this.shaderKey=`matMulSmallOutputSize_${this.activation}_${n}_${s}`}getUserCode(){return`
      ${Vt(this.activation,this.hasPreluActivationWeights)}
      ${Ii(this.addBias,this.activation,this.transposeA,this.transposeB)}
      ${DD(this.workgroupSize)}
    `}};var Vu=class{constructor(t,e,o=!1,n=!1){this.variableNames=["A","B"],this.uniforms="dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.workgroupSize=[8,8,1],this.atomic=!0,this.splitedDimInner=128,S.assert(t[0]===1,()=>"MatMulSplitKProgram only supports batch = 1."),this.outputShape=t,this.dispatchLayout={x:[2],y:[1],z:[0,3]};let s=(o&&this.outputShape[1]%4===0||!o&&e%4===0)&&this.outputShape[2]%4===0;this.elementsPerThread=[4,4,this.splitedDimInner],this.outputComponent=s?4:1,s||(this.outputShape[1]<16&&(this.elementsPerThread[1]=1),this.outputShape[2]<16&&(this.elementsPerThread[0]=1)),this.dispatch=A(this.dispatchLayout,[this.outputShape[0],this.outputShape[1],this.outputShape[2],e],this.workgroupSize,this.elementsPerThread),this.transposeA=o,this.transposeB=n,this.shaderKey=`matMulSplitK_${o}_${n}_${this.elementsPerThread}_${this.outputComponent}`}getUserCode(){let t=this.outputComponent;return`
      ${gm(!1,this.transposeB,!1,!1,!1,t)}
      fn mm_write(batch: i32, row : i32, col : i32, value : ${et(t)}) {
        if (row < uniforms.dimAOuter && col < uniforms.dimBOuter) {
          let coords = vec3<i32>(batch, row, col);
          let flatIndex = getOutputIndexFromCoords(coords);
          // The problem is that we should initialize output to zero before using.
          // Otherwise, the original value will be added to the result.
          for (var i = 0; i < ${t}; i = i + 1) {
            ${pe("&result[flatIndex + i]",`${t>1?"value[i]":"value"}`,"float32")}
          }
        }
      }
      ${t===4?Ao(this.elementsPerThread,this.workgroupSize,this.transposeA,32,!0,this.splitedDimInner):Ro(this.elementsPerThread,this.workgroupSize,this.transposeA,32,!0,this.splitedDimInner)}
    `}},Hu=class{constructor(t,e=null,o=null,n=null){this.uniforms="",this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.addBias=e!=null,this.hasPreluActivationWeights=n!=null,this.activation=o,this.addBias&&this.variableNames.push("bias"),this.hasPreluActivationWeights&&this.variableNames.push("preluActivationWeights"),this.shaderKey=`biasActivation_${o}`}getUserCode(){return`
    ${Vt(this.activation,this.hasPreluActivationWeights)}
    ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        var value = getXByOutputIndex(index);
        ${le(this.addBias,this.activation)}
        setOutputAtIndex(index, value);
      }
    }
    `}};var qu=class{constructor(t){this.variableNames=[],this.outputShape=[],this.uniforms="value : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="fill"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.size) {
        setOutputAtIndex(index, uniforms.value);
      }
    }
  `}};function Ct(r){let{backend:t,attrs:e}=r,{shape:o,value:n}=e,{dtype:s}=e;if(s=s||S.inferDtype(n),s==="string"){let i=S.getArrayFromDType(s,S.sizeFromShape(o));return i.fill(n),t.makeTensorInfo(o,s,i)}else{let i=new qu(o),a=[{type:"float32",data:[n]}];return t.runWebGPUProgram(i,[],s,a)}}var Dy={kernelName:ra,backendName:"webgpu",kernelFunc:Ct};function G(r){let{inputs:t,attrs:e}=r,{x:o}=t,{shape:n}=e,s=S.sizeFromShape(o.shape),i=S.inferFromImplicitShape(n,s),a=S.sizeFromShape(i);return S.assert(s===a,()=>`The new shape (${i}) has ${a} elements and the old shape (${o.shape}) has ${s} elements. The new shape and old shape must have the same number of elements.`),r.backend.incRef(o.dataId),{dataId:o.dataId,shape:i,dtype:o.dtype}}var Ay={kernelName:Mn,backendName:"webgpu",kernelFunc:G};function Fo({a:r,b:t,transposeA:e,transposeB:o,backend:n,bias:s=null,preluActivationWeights:i=null,leakyreluAlpha:a=0,activation:u=null}){let p=r.shape.length,l=t.shape.length,c=e?r.shape[p-2]:r.shape[p-1],m=o?t.shape[l-1]:t.shape[l-2],f=e?r.shape[p-1]:r.shape[p-2],h=o?t.shape[l-2]:t.shape[l-1],b=r.shape.slice(0,-2),x=t.shape.slice(0,-2),C=S.sizeFromShape(b),k=S.sizeFromShape(x),I=$e.assertAndGetBroadcastShape(r.shape.slice(0,-2),t.shape.slice(0,-2)).concat([f,h]);S.assert(c===m,()=>`Error in matMul: inner shapes (${c}) and (${m}) of Tensors with shapes ${r.shape} and ${t.shape} and transposeA=${e} and transposeB=${o} must match.`);let T=e?[C,c,f]:[C,f,c],R=o?[k,h,m]:[k,m,h],M=G({inputs:{x:r},backend:n,attrs:{shape:T}}),z=G({inputs:{x:t},backend:n,attrs:{shape:R}}),B=[M,z],H=Math.max(C,k),Y=[M,z],J=[{type:"int32",data:[f]},{type:"int32",data:[h]},{type:"int32",data:[c]}],it,ut,pt=[H,f,h],Tt=L().get("WEBGPU_MATMUL_PROGRAM_TYPE");if(Tt<0){let fe=L().getNumber("WEBGPU_THRESHOLD_TO_INCREASE_WORKGROUPS_FOR_MATMUL"),Ce=fe>0?fe:n.thresholdToIncreaseWorkgroups,Xr=H*Math.ceil(f/32)*Math.ceil(h/32);Xr<=Ce||f<=8&&Xr<=Ce*2?H*f*h<=128?Tt=He.MatMulReduceProgram:H===1&&m>=2e3?Tt=He.MatMulSplitKProgram:Tt=He.MatMulSmallOutputSizeProgram:Tt=He.MatMulPackedProgram}switch(Tt){case He.MatMulReduceProgram:it=new Wu(pt,e,o,s,u,i);break;case He.MatMulSplitKProgram:{if(ut=Ct({backend:n,attrs:{shape:pt,value:0,dtype:r.dtype}}),it=new Vu(pt,m,e,o),s||u){ut=n.runWebGPUProgram(it,Y,r.dtype,J,ut);let Ce=new Hu(ut.shape,s,u,i),Xr=null,Pi=[ut];s&&Pi.push(s),i&&Pi.push(i),u==="leakyrelu"&&(Xr=[{type:"float32",data:[a]}],Ce.uniforms+=" alpha : f32,");let ef=n.runWebGPUProgram(Ce,Pi,ut.dtype,Xr);B.push(ut);let Q2=G({inputs:{x:ef},backend:n,attrs:{shape:I}});B.push(ef);for(let J2 of B)n.disposeData(J2.dataId);return Q2}break}case He.MatMulSmallOutputSizeProgram:it=new Uu(T,R,pt,e,o,s,u,i);break;case He.MatMulPackedProgram:let fe=n.adapterInfo.isIntel();it=new Ou(T,pt,e,o,s,u,i,fe);break;default:throw new Error(`Unsupported MatMulProgramType ${Tt}.`)}s&&Y.push(s),i&&Y.push(i),u==="leakyrelu"&&(J.push({type:"float32",data:[a]}),it.uniforms+=" alpha : f32,"),ut=n.runWebGPUProgram(it,Y,r.dtype,J,ut);let Me=G({inputs:{x:ut},backend:n,attrs:{shape:I}});B.push(ut);for(let fe of B)n.disposeData(fe.dataId);return Me}function AD(r){let{inputs:t,backend:e,attrs:o}=r,{a:n,b:s,bias:i,preluActivationWeights:a}=t,{transposeA:u,transposeB:p,activation:l,leakyreluAlpha:c}=o;return Fo({a:n,b:s,transposeA:u,transposeB:p,backend:e,bias:i,preluActivationWeights:a,leakyreluAlpha:c,activation:l})}var Ry={kernelName:Us,backendName:"webgpu",kernelFunc:AD};var Ei=class{constructor(t,e,o){this.variableNames=["AReal","AImag","BReal","BImag"],this.workgroupSize=[128,1,1],this.size=!0,this.outputShape=N.assertAndGetBroadcastShape(e,o),this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey=`binaryOpComplex_${t}`,this.op=t}getUserCode(){return`
      fn binaryOpComplex(
          areal : f32, aimag : f32, breal : f32, bimag : f32) -> f32 {
        ${$s(this.op,!1)}
      }

      ${D("index")} {
        if(index < uniforms.size) {
          let areal = getARealByOutputIndex(index);
          let aimag = getAImagByOutputIndex(index);
          let breal = getBRealByOutputIndex(index);
          let bimag = getBImagByOutputIndex(index);
          setOutputAtIndex(index, binaryOpComplex(areal, aimag, breal, bimag));
        }
      }
    `}};var vr=class{constructor(t,e,o){if(this.size=!0,this.variableNames=["A","B"],this.outputShape=N.assertAndGetBroadcastShape(e,o),this.dispatchLayout=F(this.outputShape),this.op=t,this.useSharedMemoryWithA=e.length<=1&&o.length>1&&e[0]<128,this.useSharedMemoryWithB=o.length<=1&&e.length>1&&o[0]<128,this.useSharedMemoryWithA||this.useSharedMemoryWithB)this.outputComponent=1,this.variableComponents=[1,1],this.lastDimensionSize=this.useSharedMemoryWithB?o[0]:e[0],this.shaderKey=`binary_${t}_${this.lastDimensionSize}`,this.type="shared",this.workgroupSize=[256,1,1];else{let n=e.length>0&&e[e.length-1]%4===0,s=o.length>0&&o[o.length-1]%4===0;n&&s?(this.outputComponent=4,this.variableComponents=[4,4]):n&&(S.isScalarShape(o)||o[o.length-1]===1)||s&&(S.isScalarShape(e)||e[e.length-1]===1)?(this.outputComponent=4,this.variableComponents=n?[4,1]:[1,4]):(this.outputComponent=1,this.variableComponents=[1,1]),this.type="nonshared",this.shaderKey=`binary_${t}_${this.variableComponents}`,this.workgroupSize=[128,1,1]}this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.outputComponent,1,1])}getUserCode(){let t,e=this.outputComponent===4?"vec4<f32>":"f32",o=`
    fn binaryOperation(a : ${e}, b : ${e}) -> ${e} {
      ${$s(this.op,this.outputComponent===4)}
    };
    `;if(this.type==="shared"){let n=this.lastDimensionSize>1?`coords[${this.outputShape.length-1}]`:"0",s=this.useSharedMemoryWithB?`let a = getAByOutputIndex(index);
          let b = sharedBuf[${n}];`:`let a = sharedBuf[${n}];
          let b = getBByOutputIndex(index);`;t=`
        ${o}
        var<workgroup> sharedBuf : array<f32, ${this.lastDimensionSize}>;
        ${D("index")} {
          // Fill in the shared memory buffer.
          let localIndex = i32(localId.x);
          if(localIndex < ${this.lastDimensionSize}) {
            sharedBuf[localIndex] = f32(${this.useSharedMemoryWithB?"B":"A"}[localIndex]);
          }
          workgroupBarrier();

          if(index < uniforms.size) {
            let coords = getCoordsFromIndex(index);
            ${s}
            setOutputAtIndex(index, binaryOperation(a, b));
          }
        }
        `}else t=`
       ${o}
       ${D("index")} {
         if (index < uniforms.size) {
           let coords = getCoordsFromIndex(index * ${this.outputComponent});
           let a = ${e}(getAByOutputCoords(coords));
           let b = ${e}(getBByOutputCoords(coords));
           setOutputAtIndex(index, binaryOperation(a, b));
         }
       }
       `;return t}};function Nt(r){let{inputs:t}=r,{x:e}=t;return r.backend.incRef(e.dataId),{dataId:e.dataId,shape:e.shape,dtype:e.dtype}}var Fy={kernelName:ar,backendName:"webgpu",kernelFunc:Nt};function Se(r){let{inputs:t,backend:e}=r,{real:o,imag:n}=t,s=e.makeTensorInfo(o.shape,"complex64"),i=e.tensorMap.get(s.dataId),a=Nt({inputs:{x:o},backend:e}),u=Nt({inputs:{x:n},backend:e});return i.complexTensorInfos={real:a,imag:u},s}var Py={kernelName:Bs,backendName:"webgpu",kernelFunc:Se};var ce=class{constructor(t,e,o=""){this.variableNames=["A"],this.size=!0;let n=128;this.workgroupSize=[n,1,1],this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.op=e,o!==""&&(this.uniforms=o),this.shaderKey=`unary_${e}`}getUserCode(){return`
      fn unaryOperation(a : f32) -> f32 {
        ${Cr(this.op,!1)}
      }
      ${D("index")} {
        if (index < uniforms.size) {
          let a = getAByOutputIndex(index);
          setOutputAtIndex(index, unaryOperation(a));
        }
      }
      `}};function j({opType:r,cpuKernelImpl:t,dtype:e}){return({inputs:o,backend:n})=>{let{x:s}=o,i=n,a=e||s.dtype;if(i.shouldExecuteOnCPU([s])&&t!=null){let p=i.tensorMap.get(s.dataId),l=t(p.values,a);return i.makeTensorInfo(s.shape,a,l)}let u=new ce(s.shape,r);return i.runWebGPUProgram(u,[s],a)}}function ct({opType:r,cpuKernelImpl:t,supportsComplex:e=!1,dtype:o}){return({inputs:n,backend:s})=>{let{a:i,b:a}=n,u=s;if(e&&i.dtype==="complex64"){let c=u.tensorMap.get(i.dataId),m=u.tensorMap.get(a.dataId),f,h;if(r!==q.MUL)[f,h]=[[c.complexTensorInfos.real,m.complexTensorInfos.real],[c.complexTensorInfos.imag,m.complexTensorInfos.imag]].map(x=>{let[C,k]=x,v={dataId:C.dataId,dtype:C.dtype,shape:i.shape},I={dataId:k.dataId,dtype:k.dtype,shape:a.shape},T=new vr(r,i.shape,a.shape);return u.runWebGPUProgram(T,[v,I],qt(C.dtype,k.dtype))});else{let x=new Ei(q.COMPLEX_MULTIPLY_REAL,i.shape,a.shape),C=new Ei(q.COMPLEX_MULTIPLY_IMAG,i.shape,a.shape),k=[{dataId:c.complexTensorInfos.real.dataId,dtype:c.complexTensorInfos.real.dtype,shape:i.shape},{dataId:c.complexTensorInfos.imag.dataId,dtype:c.complexTensorInfos.imag.dtype,shape:i.shape},{dataId:m.complexTensorInfos.real.dataId,dtype:m.complexTensorInfos.real.dtype,shape:a.shape},{dataId:m.complexTensorInfos.imag.dataId,dtype:m.complexTensorInfos.imag.dtype,shape:a.shape}];f=u.runWebGPUProgram(x,k,"float32"),h=u.runWebGPUProgram(C,k,"float32")}let b=Se({inputs:{real:f,imag:h},backend:u});return u.disposeData(f.dataId),u.disposeData(h.dataId),b}let p=o||qt(i.dtype,a.dtype);if((i.dtype==="string"||a.dtype==="string"||u.shouldExecuteOnCPU([i,a]))&&t!=null){let c=u.tensorMap.get(i.dataId).values,m=u.tensorMap.get(a.dataId).values,f=i.dtype==="string"?N.fromUint8ToStringArray(c):c,h=i.dtype==="string"?N.fromUint8ToStringArray(m):m,[b,x]=t(i.shape,a.shape,f,h,p);return u.makeTensorInfo(x,p,b)}let l=new vr(r,i.shape,a.shape);return u.runWebGPUProgram(l,[i,a],p)}}var Om={};Ht(Om,{addImpl:()=>bm,bincountImpl:()=>By,bincountReduceImpl:()=>zy,bitwiseAndImpl:()=>wm,castImpl:()=>ym,ceilImpl:()=>Sm,concatImpl:()=>Ly,equalImpl:()=>Cm,expImpl:()=>vm,expm1Impl:()=>km,floorDivImpl:()=>Em,floorImpl:()=>Im,gatherNdImpl:()=>Gy,gatherV2Impl:()=>Oy,greaterEqualImpl:()=>Nm,greaterImpl:()=>$m,lessEqualImpl:()=>Dm,lessImpl:()=>Tm,linSpaceImpl:()=>Wy,logImpl:()=>Am,maxImpl:()=>Uy,maximumImpl:()=>Rm,minimumImpl:()=>Fm,multiplyImpl:()=>Ni,negImpl:()=>Vy,notEqualImpl:()=>Pm,prodImpl:()=>qy,raggedGatherImpl:()=>Xy,raggedRangeImpl:()=>Yy,raggedTensorToTensorImpl:()=>Jy,rangeImpl:()=>tb,rsqrtImpl:()=>_m,scatterImpl:()=>eb,sigmoidImpl:()=>rb,simpleAbsImpl:()=>My,sliceImpl:()=>ob,sparseFillEmptyRowsImpl:()=>nb,sparseReshapeImpl:()=>sb,sparseSegmentReductionImpl:()=>ib,sqrtImpl:()=>ab,squaredDifferenceImpl:()=>Bm,staticRegexReplaceImpl:()=>zm,stridedSliceImpl:()=>ub,stringNGramsImpl:()=>pb,stringSplitImpl:()=>lb,stringToHashBucketFastImpl:()=>cb,subImpl:()=>Gm,tileImpl:()=>mb,topKImpl:()=>db,transposeImpl:()=>Hy,uniqueImpl:()=>hb});function Ku(r,t){Array.isArray(r)||(r=[r]),r.forEach(e=>{e!=null&&S.assert(e.dtype!=="complex64",()=>`${t} does not support complex64 tensors in the CPU backend.`)})}function My(r){let t=new Float32Array(r.length);for(let e=0;e<r.length;++e)t[e]=Math.abs(r[e]);return t}function gt(r){return(t,e,o,n,s)=>{let i=N.assertAndGetBroadcastShape(t,e),a=i.length,u=S.computeStrides(i),p=S.sizeFromShape(i),l=S.getTypedArrayFromDType(s,p),c=t.length,m=e.length,f=S.computeStrides(t),h=S.computeStrides(e),b=N.getBroadcastDims(t,i),x=N.getBroadcastDims(e,i);if(b.length+x.length===0)for(let C=0;C<l.length;++C)l[C]=r(o[C%o.length],n[C%n.length]);else for(let C=0;C<l.length;++C){let k=S.indexToLoc(C,a,u),v=k.slice(-c);b.forEach(M=>v[M]=0);let I=S.locToIndex(v,c,f),T=k.slice(-m);x.forEach(M=>T[M]=0);let R=S.locToIndex(T,m,h);l[C]=r(o[I],n[R])}return[l,i]}}function Ns(r){let{inputs:t,backend:e}=r,{real:o,imag:n}=t,s=e.data.get(o.dataId).values,i=e.data.get(n.dataId).values,a=e.makeTensorInfo(o.shape,"complex64"),u=e.data.get(a.dataId);return u.complexTensorInfos={real:e.makeTensorInfo(o.shape,"float32",s),imag:e.makeTensorInfo(n.shape,"float32",i)},a}function Xu(r,t,e="float32"){if(e==="complex64"){let n=Xu(r,t,"float32"),s=Xu(r,t,"float32");return Ns({inputs:{real:n,imag:s},backend:r})}let o=S.makeZerosTypedArray(S.sizeFromShape(t),e);return r.makeTensorInfo(t,e,o)}function xm(r){let{inputs:t,backend:e}=r,{x:o}=t;return e.incRef(o.dataId),{dataId:o.dataId,shape:o.shape,dtype:o.dtype}}function _y(r){let{inputs:t,backend:e}=r,{input:o}=t,n=e.data.get(o.dataId).complexTensorInfos.real,s=e.data.get(n.dataId).values;return e.makeTensorInfo(n.shape,n.dtype,s)}function ym(r,t,e,o){if(o==="int32"){let n=Int32Array.from(r);return[t,"int32",n]}if(o==="bool"){let n=S.toTypedArray([0],e),[s,i]=gt((a,u)=>a!==u?1:0)(t,[],r,n,"bool");return[i,"bool",s]}throw new Error(`Error in Cast: failed to cast ${e} to ${o}`)}function $i(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{dtype:s}=o;if(s==="complex64"){if(n.dtype==="complex64")return xm({inputs:{x:n},backend:e});let l=Xu(e,n.shape,n.dtype),c=$i({inputs:{x:n},backend:e,attrs:{dtype:"float32"}}),m=Ns({inputs:{real:c,imag:l},backend:e});return e.disposeIntermediateTensorInfo(l),e.disposeIntermediateTensorInfo(c),m}if(n.dtype==="complex64"){let l=_y({inputs:{input:n},backend:e}),c=$i({inputs:{x:l},backend:e,attrs:{dtype:s}});return e.disposeIntermediateTensorInfo(l),c}if(!S.hasEncodingLoss(n.dtype,s)){let l=xm({inputs:{x:n},backend:e});return{dataId:l.dataId,shape:l.shape,dtype:s}}let i=e.data.get(n.dataId).values,[a,u,p]=ym(i,n.shape,n.dtype,s);return e.makeTensorInfo(a,u,p)}function bt(r,t,e,o){return e==null?({inputs:n,backend:s})=>{let{a:i,b:a}=n,u=s;Ku([i,a],r);let p=u.data.get(i.dataId).values,l=u.data.get(a.dataId).values,c=i.dtype==="string"?N.fromUint8ToStringArray(p):p,m=i.dtype==="string"?N.fromUint8ToStringArray(l):l,f=o||i.dtype,[h,b]=t(i.shape,a.shape,c,m,f);return u.makeTensorInfo(b,f,h)}:({inputs:n,backend:s})=>{let{a:i,b:a}=n,u=s;if(i.dtype==="complex64"||a.dtype==="complex64"){let p=$i({inputs:{x:i},backend:u,attrs:{dtype:"complex64"}}),l=u.data.get(p.dataId),c=l.complexTensorInfos.real,m=l.complexTensorInfos.imag,f=u.data.get(c.dataId).values,h=u.data.get(m.dataId).values,b=$i({inputs:{x:a},backend:u,attrs:{dtype:"complex64"}}),x=u.data.get(b.dataId),C=x.complexTensorInfos.real,k=x.complexTensorInfos.imag,v=u.data.get(C.dataId).values,I=u.data.get(k.dataId).values,[T,R,M]=e(i.shape,a.shape,f,h,v,I),z=u.makeTensorInfo(M,"float32",T),B=u.makeTensorInfo(M,"float32",R),H=Ns({inputs:{real:z,imag:B},backend:u});return u.disposeIntermediateTensorInfo(p),u.disposeIntermediateTensorInfo(b),u.disposeIntermediateTensorInfo(z),u.disposeIntermediateTensorInfo(B),H}else{let p=u.data.get(i.dataId).values,l=u.data.get(a.dataId).values,c=o||i.dtype,[m,f]=t(i.shape,a.shape,p,l,c);return u.makeTensorInfo(f,c,m)}}}function Ts(r){return(t,e,o,n,s,i)=>{let a=N.assertAndGetBroadcastShape(t,e),u=S.sizeFromShape(a),p=a.length,l=S.computeStrides(a),c=S.getTypedArrayFromDType("float32",u),m=S.getTypedArrayFromDType("float32",u),f=N.getBroadcastDims(t,a),h=N.getBroadcastDims(e,a),b=N.mergeRealAndImagArrays(o,n),x=N.mergeRealAndImagArrays(s,i),C=t.length,k=S.computeStrides(t),v=e.length,I=S.computeStrides(e);if(f.length+h.length===0)for(let T=0;T<c.length;T++){let R=T%b.length,M=T%x.length,z=r(b[R*2],b[R*2+1],x[M*2],x[M*2+1]);c[T]=z.real,m[T]=z.imag}else for(let T=0;T<c.length;T++){let R=S.indexToLoc(T,p,l),M=R.slice(-C);f.forEach(J=>M[J]=0);let z=S.locToIndex(M,C,k),B=R.slice(-v);h.forEach(J=>B[J]=0);let H=S.locToIndex(B,v,I),Y=r(b[z*2],b[z*2+1],x[H*2],x[H*2+1]);c[T]=Y.real,m[T]=Y.imag}return[c,m,a]}}var bm=gt(((r,t)=>r+t)),RD=Ts(((r,t,e,o)=>({real:r+e,imag:t+o}))),yvt=bt("Add",bm,RD);function By(r,t,e,o,n){let s=S.sizeFromShape(o),i=S.makeZerosTypedArray(n,e);for(let a=0;a<r.length;a++){let u=r[a];if(u<0)throw new Error("Input x must be non-negative!");u>=n||(s>0?i[u]+=t[a]:i[u]+=1)}return i}function zy(r,t,e,o=!1){let n=r.shape[0],s=r.shape[1],i=st([n,e],t.dtype);for(let a=0;a<n;a++)for(let u=0;u<s;u++){let p=r.get(a,u);if(p<0)throw new Error("Input x must be non-negative!");p>=e||(o?i.set(1,a,p):t.size>0?i.set(i.get(a,p)+t.get(a,u),a,p):i.set(i.get(a,p)+1,a,p))}return i}var wm=gt(((r,t)=>r&t)),Ivt=bt(zi,wm);function Mt(r){return(t,e,o)=>{let n=S.getArrayFromDType(e,t.length);for(let s=0;s<t.length;++s)n[s]=r(t[s],o);return n}}function ju(r,t,e){let o=Mt(t);return oe(r,o,e)}function oe(r,t,e){return({inputs:o,attrs:n,backend:s})=>{let{x:i}=o;Ku(i,r);let a=s,u=a.data.get(i.dataId).values,p;if(i.dtype==="string"){if(!Array.isArray(u))throw new Error("String tensor's value was not an instance of Array");p=N.fromUint8ToStringArray(u)}else p=u;let l=e||i.dtype,c=t(p,l,n);return a.makeTensorInfo(i.shape,l,c)}}var Sm=Mt(r=>Math.ceil(r)),_vt=oe(Er,Sm);function Ly(r,t,e,o){let n=S.getArrayFromDType(e,S.sizeFromShape(t));if(o&&e!=="string"){let s=0;r.forEach(i=>{let a=S.sizeFromShape(i.shape);n.set(i.vals,s),s+=a})}else{let s=0;r.forEach(i=>{let a=e==="string"?N.fromUint8ToStringArray(i.vals):i.vals,u=0;for(let p=0;p<i.shape[0];++p){let l=p*t[1]+s;for(let c=0;c<i.shape[1];++c)n[l+c]=a[u++]}s+=i.shape[1]})}return n}var Cm=gt((r,t)=>r===t?1:0),Uvt=bt(pn,Cm,null,"bool");var vm=Mt(r=>Math.exp(r)),Xvt=oe("Exp",vm,"float32");var km=Mt(r=>Math.expm1(r)),Jvt=oe($r,km);var Im=Mt(r=>Math.floor(r)),nkt=oe(Nr,Im);var Em=gt((r,t)=>Math.floor(r/t)),pkt=bt(Tr,Em,null,"int32");function Gy(r,t,e,o,n,s,i,a,u){let p=st([o,s],e);for(let l=0;l<o;l++){let c=[],m=0;for(let f=0;f<n;f++){let h=r[l*n+f];m+=h*i[f],c.push(h)}if(m<0||m>=u/s)throw new Error(`Invalid indices: ${c} does not index into ${a}`);for(let f=0;f<s;f++)p.values[l*s+f]=t.get(...t.indexToLoc(m*s+f))}return p}function Oy(r,t,e){let o=st(e,r.dtype);for(let n=0;n<o.size;++n){let i=o.indexToLoc(n).slice(),a=i[0],u=i[2],p=t.locToIndex([a,u]);i[2]=t.values[p];let l=r.locToIndex(i);0<=l&&l<r.values.length&&(o.values[n]=r.values[l])}return o}var $m=gt((r,t)=>r>t?1:0),ykt=bt(dn,$m,null,"bool");var Nm=gt((r,t)=>r>=t?1:0),vkt=bt(Dr,Nm,null,"bool");var Tm=gt((r,t)=>r<t?1:0),Nkt=bt(bn,Tm,null,"bool");var Dm=gt((r,t)=>r<=t?1:0),Fkt=bt(wn,Dm,null,"bool");function Wy(r,t,e){let o=(t-r)/(e-1),n=S.makeZerosTypedArray(e,"float32");n[0]=r;for(let s=1;s<n.length;s++)n[s]=n[s-1]+o;return n}var Am=Mt(r=>Math.log(r)),Gkt=oe("Log",Am);function Uy(r,t,e,o){let n=S.getTypedArrayFromDType(o,S.sizeFromShape(e));for(let s=0;s<n.length;++s){let i=s*t,a=r[i];for(let u=0;u<t;++u){let p=r[i+u];(Number.isNaN(p)||p>a)&&(a=p)}n[s]=a}return n}var Rm=gt(((r,t)=>Math.max(r,t))),Kkt=bt(Ar,Rm);var Fm=gt(((r,t)=>Math.min(r,t))),Qkt=bt(Rr,Fm);var Ni=gt(((r,t)=>r*t)),FD=Ts(((r,t,e,o)=>({real:r*e-t*o,imag:r*o+t*e}))),oIt=bt(Fr,Ni,FD);function Vy(r,t,e){let o=S.createScalarValue(-1,e);return Ni([],t,o,r,e)}var Pm=gt(((r,t)=>r!==t?1:0)),cIt=bt($n,Pm,null,"bool");function Hy(r,t,e,o,n){let s=t.length,i=S.sizeFromShape(t),a=S.computeStrides(t),u=S.computeStrides(n),p=S.getTypedArrayFromDType(e,S.sizeFromShape(n));for(let l=0;l<i;++l){let c=S.indexToLoc(l,s,a),m=new Array(c.length);for(let h=0;h<m.length;h++)m[h]=c[o[h]];let f=S.locToIndex(m,s,u);p[f]=r[l]}return p}function qy(r,t,e,o){let[n,s]=N.computeOutAndReduceShapes(r,o),i=qt(t,"int32"),a=S.makeZerosTypedArray(S.sizeFromShape(n),i),u=S.sizeFromShape(s);for(let p=0;p<a.length;++p){let l=p*u,c=1;for(let m=0;m<u;++m)c*=e[l+m];a[p]=c}return{outVals:a,outShape:n,outDtype:i}}function PD(r,t,e){r.forEach((o,n)=>{if(o<0||o>=e){let s=S.indexToLoc(n,t.length,S.computeStrides(t)).join(",");throw new Error(`indices[${s}] = ${o} is not in [0, ${e})`)}})}function MD(r,t){for(let e=0;e<r.length;++e){let o=r[e],n=e===r.length-1?t:r[e+1].length;if(o.length===0)throw new Error("Ragged splits may not be empty");if(o[0]<0)throw new Error("Ragged splits must be non-negative");if(o[o.length-1]>n)throw new Error("Ragged splits must not point past values");for(let s=1;s<o.length;++s)if(o[s-1]>o[s])throw new Error("Ragged splits must be sorted in ascending order")}}function _D(r,t,e,o){let n=[],s=0,i=t.length-1+e.length,a=new Array(i).fill(null).map(()=>[0]);MD(e,o);let u=1;for(let p=0;p<t.length-1;++p){u*=t[p];let l=t[p+1];for(let c=1;c<u+1;++c)a[p].push(c*l)}for(let p=0;p<r.length;++p){let l=r[p],c=r[p]+1;for(let m=0;m<e.length;++m){let f=e[m],h=m+t.length-1;if(h>=0){let b=a[h],x=b[b.length-1]-f[l];for(let C=l;C<c;++C)a[h].push(f[C+1]+x)}l=f[l],c=f[c]}c!==l&&(n.push([l,c]),s+=c-l)}return{outSplits:a,valueSlices:n,numValues:s}}function BD(r){let t=[];for(let e=0;e<r.length;++e){let o=r[e].length,n=S.getArrayFromDType("int32",o);t.push(n),r[e].forEach((s,i)=>n[i]=s)}return t}function Ky(r,t){let e=r.slice(0,t);for(;e.length<t;)e.push(1);for(let o=t;o<r.length;o++)e[t-1]*=r[o];return e}function zD(r,t,e,o,n,s){let i=Ky(t,2)[1],a=Ky(s,2)[1],u=0;for(let p of e)for(let l=p[0];l<p[1];++l){for(let c=0;c<o;++c)n[u*a+c]=r[l*i+c];++u}}function LD(r,t,e,o,n){let s=t.slice();s[0]=n;let i=S.getArrayFromDType(e,S.sizeFromShape(s)),a=r.length,u=a===0?0:a/t[0];return zD(r,t,o,u,i,s),[i,s]}function Xy(r,t,e,o,n,s,i,a){if(r.length===0)throw new Error("paramsNestedSplits must be non empty");if(t[0].length===0)throw new Error("Split tensors must not be scalars");let u=t[0][0]-1;if(PD(s,i,u),o.length===0)throw new Error("params.rank must be nonzero");let p=o[0],{outSplits:l,valueSlices:c,numValues:m}=_D(s,i,r,p),f=BD(l),h=LD(e,o,n,c,m);return[f,h[0],h[1]]}var jy=2147483647;function Yy(r,t,e,o,n,s,i){if(t.length>1)throw new Error("starts must be a scalar or vector");if(n.length>1)throw new Error("limits must be a scalar or vector");if(i.length>1)throw new Error("deltas must be a scalar or vector");let a=t.length===0,u=n.length===0,p=i.length===0,l=[];a||l.push(t[0]),u||l.push(n[0]),p||l.push(i[0]);for(let x=1;x<l.length;++x)if(l[x]!==l[x-1])throw new Error("starts, limits, and deltas must have the same shape");let c=l.length===0?1:l[0],m=S.getArrayFromDType("int32",c+1);m[0]=0;for(let x=0;x<c;++x){let C=a?r[0]:r[x],k=u?o[0]:o[x],v=p?s[0]:s[x];if(v===0)throw new Error("Requires delta != 0");let I;if(v>0&&k<C||v<0&&k>C)I=0;else if(I=Math.ceil(Math.abs((k-C)/v)),I>jy)throw new Error(`Requires ((limit - start) / delta) <= ${jy}`);m[x+1]=m[x]+I}let f=m[c],h=S.getArrayFromDType(e,f),b=0;for(let x=0;x<c;++x){let C=m[x+1]-m[x],k=a?r[0]:r[x],v=p?s[0]:s[x];for(let I=0;I<C;++I)h[b++]=k,k+=v}return[m,h]}var Pe=N.RowPartitionType,Mm=class r{constructor(t,e,o,n,s,i,a,u,p,l){this.shape=t,this.shapeShape=e,this.values=o,this.valuesShape=n,this.valuesDType=s,this.defaultValue=i,this.defaultValueShape=a,this.rowPartitionValues=u,this.rowPartitionValuesShapes=p,this.rowPartitionTypes=N.getRowPartitionTypesHelper(l),this.raggedRank=N.getRaggedRank(this.rowPartitionTypes)}getRowPartitionTypeByDimension(t){return this.rowPartitionTypes[0]===Pe.FIRST_DIM_SIZE?this.rowPartitionTypes[t+1]:this.rowPartitionTypes[t]}getRowPartitionTensor(t){return this.rowPartitionTypes[0]===Pe.FIRST_DIM_SIZE?this.rowPartitionValues[t+1]:this.rowPartitionValues[t]}getMaxWidth(t){let e=this.getRowPartitionTensor(t-1);switch(this.getRowPartitionTypeByDimension(t-1)){case Pe.VALUE_ROWIDS:return r.getMaxWidthValueRowID(e);case Pe.ROW_SPLITS:return r.getMaxWidthRowSplit(e);default:throw new Error(`Cannot handle partition type ${Pe[this.getRowPartitionTypeByDimension(t-1)]}`)}}static getMaxWidthRowSplit(t){let e=t.length;if(e===0||e===1)return 0;let o=0;for(let n=0;n<e-1;++n){let s=t[n+1]-t[n];s>o&&(o=s)}return o}static getMaxWidthValueRowID(t){let e=t.length;if(e===0)return 0;let o=0,n=t[0],s=0;for(let i=1;i<e;++i){let a=t[i];a!==n&&(n=a,s=Math.max(i-o,s),o=i)}return Math.max(e-o,s)}tensorShapeFromTensor(t,e,o=!0){if(e.length===0){if(t[0]===-1)return[];throw new Error("The only valid scalar shape tensor is the fully unknown shape specified as -1.")}return Qy(t,o)}calculateOutputSize(t){let e=this.valuesShape,o=this.defaultValueShape;N.validateDefaultValueShape(o,e);let n=this.tensorShapeFromTensor(this.shape,this.shapeShape),i=N.combineRaggedTensorToTensorShapes(this.raggedRank,n,e);i[0]<0&&(i[0]=t);for(let a=1;a<=this.raggedRank;++a)i[a]<0&&(i[a]=this.getMaxWidth(a));return i}calculateFirstParentOutputIndex(t,e,o){let n=Math.min(t,o),s=[],i=0;for(let a=0;a<n;++a,i+=e)s.push(i);for(let a=n;a<t;++a)s.push(-1);return S.assert(s.length===t,()=>"Final length of result must be equal to firstDimension."),s}calculateOutputIndexRowSplit(t,e,o,n){let s=t.length,i=[];for(let a=0;a<s-1;++a){let u=t[a+1]-t[a],p=Math.min(n,u),l=e[a];l===-1&&(p=0);for(let c=0;c<p;++c)i.push(l),l+=o;for(let c=0;c<u-p;++c)i.push(-1)}if(s>0&&i.length!==t[s-1])throw new Error("Invalid row split size.");return i}calculateOutputIndexValueRowID(t,e,o,n){let s=t.length,i=[];if(s===0)return[];let a=0,u=t[0];if(u>=e.length)throw new Error(`Got currentValueRowId=${u}, which is not less than ${e.length}`);let p=e[u];i.push(p);for(let l=1;l<s;++l){let c=t[l];if(c===u)p>=0&&(++a,a<n?p+=o:p=-1);else{if(a=0,u=c,c>=e.length)throw new Error(`Got nextValueRowId=${c} which is not less than ${e.length}`);p=e[c]}i.push(p)}if(i.length!==t.length)throw new Error("Invalid row ids.");return i}calculateOutputIndex(t,e,o,n){let s=this.getRowPartitionTensor(t),i=this.getRowPartitionTypeByDimension(t);switch(i){case Pe.VALUE_ROWIDS:return this.calculateOutputIndexValueRowID(s,e,o,n);case Pe.ROW_SPLITS:if(s.length-1>e.length)throw new Error(`Row partition size is greater than output size: ${s.length-1} > ${e.length}`);return this.calculateOutputIndexRowSplit(s,e,o,n);default:throw new Error(`Unsupported partition type: ${Pe[i]}`)}}getFirstDimensionSize(){let t=this.rowPartitionValues[0];if(this.rowPartitionTypes.length===0)throw new Error("No row_partition_types given.");let e=this.rowPartitionTypes[0];switch(e){case Pe.FIRST_DIM_SIZE:return t[0];case Pe.VALUE_ROWIDS:throw new Error("Cannot handle VALUE_ROWIDS in first dimension.");case Pe.ROW_SPLITS:return this.rowPartitionValuesShapes[0][0]-1;default:throw new Error(`Cannot handle type ${Pe[e]}`)}}compute(){if(this.rowPartitionValues[0].length<=0)throw new Error("Invalid first partition input. Tensor requires at least one element.");let e=this.getFirstDimensionSize(),o=this.calculateOutputSize(e),n=new Array(this.raggedRank+1);n[n.length-1]=1;for(let u=n.length-2;u>=0;--u)n[u]=n[u+1]*o[u+1];let s=Qy(o,!1),i=S.getArrayFromDType(this.valuesDType,S.sizeFromShape(s));if(n[0]*o[0]>0){let u=this.calculateFirstParentOutputIndex(e,n[0],o[0]);for(let p=1;p<=this.raggedRank;++p)u=this.calculateOutputIndex(p-1,u,n[p],o[p]);this.setOutput(this.raggedRank,u,i,s)}return[s,i]}setOutput(t,e,o,n){if(o.length===0)return;let s=this.values,i=o,a=n.slice();a=a.slice(t+1);let u=S.sizeFromShape(a),p=e.length,l=this.defaultValue;if(l.length!==u&&l.length!==1){let h=this.defaultValueShape;dt(()=>{let b=E(l,h);l=ao(b,a).dataSync()})}let c=0,m=0,f=0;for(let h=0;h<=p;++h){let b=h<p?e[h]:-1;if(b===f){++f;continue}if(m<f){let x=s.subarray(c*u),C=i.subarray(m*u),k=(f-m)*u;Zy(C,x,k)}if(h>=p){let x=o.length;b=Math.floor(x/u)}if(b>f)if(this.defaultValue.length===1)i.subarray(f*u,b*u).fill(this.defaultValue[0]),f=b;else for(;b>f;){let x=i.slice(f*u);Zy(x,l,u),++f}b<0?(c=h+1,m=f):(c=h,m=f,f=m+1)}}};function Zy(r,t,e){for(let o=0;o<e;o++)r[o]=t[o]}function Qy(r,t){let e=[];for(let o of r){if(o<0){if(!t)throw new Error(`Dimension ${o} must be >= 0`);if(o<-1)throw new Error(`Dimension ${o} must be >= -1`);o=-1}e.push(o)}return e}function Jy(r,t,e,o,n,s,i,a,u,p){return new Mm(r,t,e,o,n,s,i,a,u,p).compute()}function tb(r,t,e,o){let n=r===t,s=r<t&&e<0,i=t<r&&e>1;if(n||s||i)return S.makeZerosTypedArray(0,o);let a=Math.abs(Math.ceil((t-r)/e)),u=S.makeZerosTypedArray(a,o);t<r&&e===1&&(e=-1),u[0]=r;for(let p=1;p<u.length;p++)u[p]=u[p-1]+e;return u}var _m=Mt(r=>1/Math.sqrt(r)),NIt=oe(Pr,_m);function eb(r,t,e,o,n,s,i,a,u,p){let l=[o/n,n],c=r.values,m=t.values;if(o===0)return st(e,t.dtype);let f=u instanceof he?u:st(l,t.dtype);typeof u=="string"||typeof u=="number"?f.values.fill(u):typeof u=="boolean"&&f.values.fill(+u);for(let h=0;h<s;h++){let b=[],x=0;for(let C=0;C<i;C++){let k=c[h*i+C];b.push(k),x+=k*a[C]}if(x<0||x>=o/n)throw new Error(`Invalid indices: ${b} does not index into ${e}`);for(let C=0;C<n;C++)p?f.values[x*n+C]+=m[h*n+C]:f.values[x*n+C]=t.rank===0?m[0]:m[h*n+C]}return f}var rb=Mt(r=>1/(1+Math.exp(-r))),MIt=ju(Mr,r=>1/(1+Math.exp(-r)));function ob(r,t,e,o,n){let s=be.isSliceContinous(o,t,e),i=S.sizeFromShape(e),a=S.computeStrides(o);if(s){let c=be.computeFlatOffset(t,a);return n==="string"?r.slice(c,c+i):r.subarray(c,c+i)}let u=n==="string"?N.fromUint8ToStringArray(r):r,p=st(o,n,u),l=st(e,n);for(let c=0;c<l.size;++c){let m=l.indexToLoc(c),f=m.map((h,b)=>h+t[b]);l.set(p.get(...f),...m)}return n==="string"?N.fromStringArrayToUint8(l.values):l.values}function nb(r,t,e,o,n,s,i){let a=t[0],u=s[0],p=new Array(u),l=new Array(a),c=t[1];if(u===0){if(a!==0)throw new Error(N.getSparseFillEmptyRowsIndicesDenseShapeMismatch(a));let x=S.getArrayFromDType(e,0),C=S.getArrayFromDType(n,0);return[x,[0,c],C,p,l]}let m=!0,f=0,h=new Array(u).fill(0);for(let x=0;x<a;++x){let C=r[x*c];if(C<0)throw new Error(N.getSparseFillEmptyRowsNegativeIndexErrorMessage(x,C));if(C>=u)throw new Error(N.getSparseFillEmptyRowsOutOfRangeIndexErrorMessage(x,C,u));++h[C],m=m&&C>=f,f=C}let b=!0;for(let x=0;x<u;++x){let C=h[x]===0;p[x]=C,b=b&&!C,h[x]=Math.max(h[x],1),x>0&&(h[x]+=h[x-1])}if(b&&m){let x=r,C=o;for(let k=0;k<a;++k)l[k]=k;return[x,[a,c],C,p,l]}else{let x=h[u-1],C=S.getArrayFromDType(e,x*c),k=S.getArrayFromDType(n,x),v=new Array(u).fill(0);for(let I=0;I<a;++I){let T=r[I*c],R=v[T],M=(T===0?0:h[T-1])+R;v[T]++;for(let z=0;z<c;++z)C[M*c+z]=r[I*c+z];k[M]=o[I],l[I]=M}for(let I=0;I<u;++I)if(v[I]===0){let R=I===0?0:h[I-1];C[R*c+0]=I;for(let M=1;M<c;++M)C[R*c+M]=0;k[R]=i}return[C,[x,c],k,p,l]}}function sb(r,t,e,o,n){let s=S.sizeFromShape(o),i=t[0],a=n.length,u=[],p=1,l=-1;for(let x=0;x<a;++x){let C=n[x];if(C===-1){if(l!==-1)throw new Error(N.getSparseReshapeMultipleNegativeOneOutputDimErrorMessage(l,x));l=x,u.push(1)}else{if(C<0)throw new Error(N.getSparseReshapeNegativeOutputDimErrorMessage(x,C));p*=C,u.push(C)}}if(l!==-1){if(p<=0)throw new Error(N.getSparseReshapeEmptyTensorZeroOutputDimErrorMessage());let x=Math.trunc(s/p);if(p*x!==s)throw new Error(N.getSparseReshapeInputOutputMultipleErrorMessage(o,u));u[l]=x}if(S.sizeFromShape(u)!==s)throw new Error(N.getSparseReshapeInputOutputMismatchErrorMessage(o,u));let m=o.length,f=[];if(m>0){f[m-1]=1;for(let x=m-2;x>=0;--x)f[x]=f[x+1]*o[x+1]}let h=[];if(a>0){h[a-1]=1;for(let x=a-2;x>=0;--x)h[x]=h[x+1]*u[x+1]}let b=S.getArrayFromDType(e,i*a);for(let x=0;x<i;++x){let C=0;for(let k=0;k<m;++k)C+=r[x*m+k]*f[k];for(let k=0;k<a;++k)b[x*a+k]=Math.trunc(C/h[k]),C%=h[k]}return[b,[i,a],u]}function ib(r,t,e,o,n,s=!1,i=0){let a=o.length,u=[t[0],r.length/t[0]],p=u[1],c=a>0?n[a-1]+1:0;if(c<0)throw new Error(N.getSparseSegmentReductionNegativeSegmentIdsErrorMessage());let m=t.slice();m[0]=c;let f=m.reduce((v,I)=>v*I,1),h=S.getArrayFromDType(e,f);if(a===0)return c>0&&h.fill(i),[h,m];if(c<=0)throw new Error(N.getSparseSegmentReductionNegativeSegmentIdsErrorMessage());let b=0,x=1,C=0,k=n[b];for(;;){let v=0;if(x<a){if(v=n[x],k===v){++x;continue}if(k>=v)throw new Error(N.getSparseSegmentReductionNonIncreasingSegmentIdsErrorMessage())}if(k<0||k>=c)throw new Error(N.getSparseSegmentReductionSegmentIdOutOfRangeErrorMessage(k,c));k>C&&h.fill(i,C*p,k*p);for(let I=b;I<x;++I){let T=o[I];if(T<0||T>=u[0])throw new Error(N.getSparseSegmentReductionIndicesOutOfRangeErrorMessage(I,o[I],u[0]));for(let R=0;R<p;R++)h[k*p+R]+=r[T*p+R]}if(s)for(let I=0;I<p;I++)h[k*p+I]/=x-b;if(b=x,++x,C=k+1,k=v,x>a)break}return C<c&&h.fill(i,C*p,c*p),[h,m]}var ab=Mt(r=>Math.sqrt(r)),XIt=ju(_r,r=>Math.sqrt(r));var Bm=gt(((r,t)=>{let e=r-t;return e*e})),JIt=bt(Br,Bm);var zm=Mt((r,t)=>{let{pattern:e,replaceGlobal:o,rewrite:n}=t;return r.replace(new RegExp(e,o?"g":""),n)}),n3t=oe(Ma,zm);function ub(r,t,e,o){let n=st(r,t.dtype);for(let s=0;s<n.size;s++){let i=n.indexToLoc(s),a=new Array(i.length);for(let u=0;u<a.length;u++)a[u]=i[u]*e[u]+o[u];n.set(t.get(...a),...i)}return n}var Lm=class{constructor(t,e,o,n,s,i){this.separator=S.encodeString(t),this.nGramWidths=e,this.leftPad=S.encodeString(o),this.rightPad=S.encodeString(n),this.padWidth=s,this.preserveShort=i}getPadWidth(t){return Math.min(this.padWidth<0?t-1:this.padWidth,t-1)}getNumNGrams(t,e){let o=this.getPadWidth(e);return Math.max(0,t+2*o-e+1)}createNGrams(t,e,o,n,s,i){for(let a=0;a<s;++a){let u=this.getPadWidth(i),p=Math.max(0,u-a),l=Math.max(0,u-(s-(a+1))),c=i-(p+l),m=e+(p>0?0:a-u),f=0;f+=p*this.leftPad.length;for(let k=0;k<c;++k)f+=t[m+k].length;f+=l*this.rightPad.length;let h=p+l+c-1;f+=h*this.separator.length,o[n+a]=new Uint8Array(f);let b=o[n+a],x=0,C=k=>k.forEach(v=>b[x++]=v);for(let k=0;k<p;++k)C(this.leftPad),C(this.separator);for(let k=0;k<c-1;++k)C(t[m+k]),C(this.separator);if(c>0){C(t[m+c-1]);for(let k=0;k<l;++k)C(this.separator),C(this.rightPad)}else{for(let k=0;k<l-1;++k)C(this.rightPad),C(this.separator);C(this.rightPad)}}}compute(t,e){let o=t.length,n=e.length;if(n>0){let u=e[0];if(u!==0)throw new Error(`First split value must be 0, got ${u}`);for(let p=1;p<n;++p){let l=e[p]>=u;if(l=l&&e[p]<=o,!l)throw new Error(`Invalid split value ${e[p]}, must be in [${u}, ${o}]`);u=e[p]}if(u!==o)throw new Error(`Last split value must be data size. Expected ${o}, got ${u}`)}let s=n-1,i=S.getArrayFromDType("int32",n);if(o===0||n===0){let u=new Array(o);for(let p=0;p<=s;++p)i[p]=0;return[u,i]}i[0]=0;for(let u=1;u<=s;++u){let p=e[u]-e[u-1],l=0;this.nGramWidths.forEach(c=>{l+=this.getNumNGrams(p,c)}),this.preserveShort&&p>0&&l===0&&(l=1),i[u]=i[u-1]+l}let a=new Array(i[s]);for(let u=0;u<s;++u){let p=e[u],l=i[u];if(this.nGramWidths.forEach(c=>{let m=e[u+1]-e[u],f=this.getNumNGrams(m,c);this.createNGrams(t,p,a,l,f,c),l+=f}),this.preserveShort&&l===i[u]){let c=e[u+1]-e[u];if(c===0)continue;let m=c+2*this.padWidth;this.createNGrams(t,p,a,l,1,m)}}return[a,i]}};function pb(r,t,e,o,n,s,i,a){return new Lm(e,o,n,s,i,a).compute(r,t)}function GD(r,t,e,o){if(!r.length)return;if(t.length===0){for(let s=0;s<r.length;++s)o.push(r.subarray(s,s+1));return}if(t.length===1){let s=t[0],i=r.indexOf(s);for(;i!==-1;){let a=r.subarray(0,i);(!e||a.length!==0)&&o.push(a),r=r.subarray(i+1),i=r.indexOf(s)}(!e||r.length!==0)&&o.push(r);return}let n=0;for(let s=0;s<r.length+1;s++)if(s===r.length||t.indexOf(r[s])!==-1){let i=r.subarray(n,s);(!e||i.length!==0)&&o.push(i),n=s+1}}function lb(r,t,e){let o=r.length,n=[],s=0,i=0,a=new Array(o);for(let m=0;m<o;++m){let f=n.length;GD(r[m],t,e,n);let h=n.length-f;a[m]=h,s+=h,i=Math.max(i,h)}let u=S.getArrayFromDType("int32",s*2),p=new Array(s),l=[o,i],c=0;for(let m=0;m<o;++m)for(let f=0;f<a[m];++f)u[c*2]=m,u[c*2+1]=f,p[c]=n[c],++c;return[u,p,l]}function cb(r,t){let e=S.getArrayFromDType("int32",r.length);for(let o=0;o<r.length;++o)e[o]=S.fingerPrint64(r[o]).modulo(t).getLowBitsUnsigned();return e}var Gm=gt(((r,t)=>r-t)),OD=Ts(((r,t,e,o)=>({real:r-e,imag:t-o}))),x3t=bt("Sub",Gm,OD);function mb(r,t){let e=new Array(r.rank);for(let n=0;n<e.length;n++)e[n]=r.shape[n]*t[n];let o=st(e,r.dtype);for(let n=0;n<o.values.length;++n){let s=o.indexToLoc(n),i=new Array(r.rank);for(let u=0;u<i.length;u++)i[u]=s[u]%r.shape[u];let a=r.locToIndex(i);o.values[n]=r.values[a]}return o}var Ti=(r,t)=>{let e=t.value-r.value;return e===0?r.index-t.index:e};function fb(r,t,e=0,o=r.length-1){for(;o>e;){if(o-e>600){let a=o-e+1,u=t-e+1,p=Math.log(a),l=.5*Math.exp(2*p/3),c=.5*Math.sqrt(p*l*(a-l)/a)*Math.sign(u-a/2),m=Math.max(e,Math.floor(t-u*l/a+c)),f=Math.min(o,Math.floor(t+(a-u)*l/a+c));fb(r,t,m,f)}let n=r[t],s=e,i=o;for(S.swap(r,e,t),Ti(r[o],n)>0&&S.swap(r,e,o);s<i;){for(S.swap(r,s,i),s++,i--;Ti(r[s],n)<0;)s=s+1;for(;Ti(r[i],n)>0;)i=i-1}Ti(r[e],n)===0?S.swap(r,e,i):(i=i+1,S.swap(r,i,o)),i<=t&&(e=i+1),t<=i&&(o=i-1)}}function db(r,t,e,o,n){let s=t[t.length-1],[i,a]=[r.length/s,s],u=S.getTypedArrayFromDType(e,i*o),p=S.getTypedArrayFromDType("int32",i*o);for(let c=0;c<i;c++){let m=c*a,f=r.subarray(m,m+a),h=new Array(f.length);f.forEach((k,v)=>h[v]={value:k,index:v}),o<h.length&&(fb(h,o),h=h.slice(0,o)),n&&h.sort(Ti);let b=c*o,x=u.subarray(b,b+o),C=p.subarray(b,b+o);for(let k=0;k<o;k++)x[k]=h[k].value,C[k]=h[k].index}let l=t.slice();return l[l.length-1]=o,[st(l,e,u),st(l,"int32",p)]}function hb(r,t,e,o){let n=S.parseAxisParam(t,e)[0],s=[1,e[0],1];for(let h=0;h<n;h++)s[0]*=e[h];s[1]=e[n];for(let h=n+1;h<e.length;h++)s[2]*=e[h];let i=new Map,a=new Int32Array(e[n]),u=new he(s,o,r),p=[],l=s[0]===1&&s[2]===1;for(let h=0;h<e[n];h++){let b;if(l)b=r[h].toString();else{let C=[];for(let k=0;k<s[0];k++)for(let v=0;v<s[2];v++)C.push(u.get(k,h,v));b=C.join(",")}let x=i.get(b);if(x!=null)a[h]=x;else{let C=i.size;i.set(b,C),a[h]=C,p.push(h)}}let c=s.slice();c[1]=i.size;let m=new he(c,o);p.forEach((h,b)=>{for(let x=0;x<s[0];x++)for(let C=0;C<s[2];C++)m.set(u.get(x,h,C),x,b,C)});let f=e.slice();return f[n]=c[1],{outputValues:m.values,outputShape:f,indices:a}}var{addImpl:gb,castImpl:xb,ceilImpl:yb,concatImpl:bb,equalImpl:wb,expImpl:Sb,expm1Impl:Cb,floorImpl:vb,floorDivImpl:kb,gatherNdImpl:Ib,gatherV2Impl:Eb,greaterEqualImpl:$b,greaterImpl:Nb,lessEqualImpl:Tb,lessImpl:Db,logImpl:Ab,maxImpl:Rb,maximumImpl:Fb,minimumImpl:Pb,multiplyImpl:Mb,negImpl:_b,notEqualImpl:Bb,prodImpl:zb,rangeImpl:Lb,rsqrtImpl:Gb,scatterImpl:Ob,simpleAbsImpl:Wb,sliceImpl:Ub,stridedSliceImpl:Vb,stringNGramsImpl:Hb,subImpl:qb,tileImpl:Kb,topKImpl:Xb,transposeImpl:jb,uniqueImpl:SEt}=Om;var WD=j({opType:P.ABS,cpuKernelImpl:Wb}),Yb={kernelName:"Abs",backendName:"webgpu",kernelFunc:WD};var UD=j({opType:P.ACOS}),Zb={kernelName:Bo,backendName:"webgpu",kernelFunc:UD};var VD=j({opType:P.ACOSH}),Qb={kernelName:zo,backendName:"webgpu",kernelFunc:VD};var HD=ct({opType:q.ADD,cpuKernelImpl:gb,supportsComplex:!0}),Jb={kernelName:"Add",backendName:"webgpu",kernelFunc:HD};var Yu=class{constructor(t){this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t[0],this.variableNames=t.map((e,o)=>`T${o}`),this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.shaderKey="addN"}getUserCode(){let t=[];this.variableNames.forEach(n=>{t.push(`let v${n} = get${n}ByOutputCoords(coords);`)});let e=this.variableNames.map(n=>`v${n}`).join(" + ");return`
      ${D("index")} {
        for (var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let flatIndex = index * ${this.workPerThread} + i;
          if (flatIndex < uniforms.size) {
            let coords = getCoordsFromIndex(flatIndex);
            ${t.join(`
        `)}
            setOutputAtIndex(flatIndex, ${e});
          }
        }
      }
    `}};function qD(r){let{inputs:t,backend:e}=r,o=t;if(o.length===1)return Nt({inputs:{x:o[0]},backend:e});let n=o.map(a=>a.dtype).reduce((a,u)=>qt(a,u)),s=o.map(a=>a.shape),i=new Yu(s);return e.runWebGPUProgram(i,o,n)}var tw={kernelName:Lo,backendName:"webgpu",kernelFunc:qD};var Zu=class{constructor(t,e){this.variableNames=["A"],this.workgroupSize=[16,16,1];let o=new Array(t.length);for(let n=0;n<o.length;n++)o[n]=t[e[n]];this.outputShape=o,this.dispatchLayout={x:[0],y:[1]},this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[1,1,1]),this.shaderKey="transposeShared"}getUserCode(){S.assert(this.workgroupSize[0]===this.workgroupSize[1],()=>`Must be a square tile, current tile shape is ${this.workgroupSize[0]} x ${this.workgroupSize[1]}`);let t=this.workgroupSize[0];return`
      var<workgroup> tile : array<array<f32, ${this.workgroupSize[0]+1}>, ${this.workgroupSize[0]}>;
      ${D()} {
        var x = i32(workgroupId.x) * ${t} + i32(localId.x);
        var y = i32(workgroupId.y) * ${t} + i32(localId.y);
        let width = uniforms.outShape[0];
        let height = uniforms.outShape[1];
        if (x < width && y < height) {
          tile[localId.y][localId.x] = f32(A[y * width + x]);
        }
        workgroupBarrier();

        x = i32(workgroupId.y) * ${t} + i32(localId.x);
        y = i32(workgroupId.x) * ${t} + i32(localId.y);
        if (x < height && y < width) {
          setOutputAtIndex((y * height + x), tile[localId.x]
            [localId.y]);
        }
      }
    `}};var Qu=class{constructor(t,e){this.variableNames=["A"],this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0;let o=new Array(t.length);for(let n=0;n<o.length;n++)o[n]=t[e[n]];this.outputShape=o,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.newDim=e,this.shaderKey=`transpose_${e}`}getUserCode(){let t=ht(this.outputShape.length),e=Wm(this.newDim);return`
      ${D("index")} {
        for(var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let flatIndex = index * ${this.workPerThread} + i;
          if(flatIndex < uniforms.size) {
            let coords = getCoordsFromIndex(flatIndex);
            setOutputAtIndex(flatIndex, A[getIndexFromCoords${this.outputShape.length}D(
              ${t}(${e}), uniforms.aShape)]);
          }
        }
      }
    `}};function Wm(r){let t=r.length;if(t>6)throw Error(`Transpose for rank ${t} is not yet supported`);let e=new Array(t);for(let o=0;o<r.length;o++)e[r[o]]=`coords.${Fe(o)}`;return e.join()}function Kt(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{perm:s}=o,i=e,a=n.shape.length,u=new Array(a);for(let l=0;l<u.length;l++)u[l]=n.shape[s[l]];if(e.shouldExecuteOnCPU([n])){let c=i.tensorMap.get(n.dataId).values,m=jb(c,n.shape,n.dtype,s,u);return e.makeTensorInfo(u,n.dtype,m)}if(n.shape.length===2&&S.arraysEqual(s,[1,0])){let l=new Zu(n.shape,s);return i.runWebGPUProgram(l,[n],n.dtype)}let p=new Qu(n.shape,s);return i.runWebGPUProgram(p,[n],n.dtype)}var ew={kernelName:Lr,backendName:"webgpu",kernelFunc:Kt};var Ju=class{constructor(t,e,o){this.variableNames=["x"],this.uniforms="reduceSize : i32,",this.size=!0,this.inputShape=[t.batchSize,t.inSize];let[n]=N.computeOutAndReduceShapes(this.inputShape,[1]);this.outputShape=n.length===0?[1]:n,t.inSize>=32768&&o>=512?this.workgroupSize=[512,1,1]:t.inSize>=4096?this.workgroupSize=[256,1,1]:this.workgroupSize=[64,1,1],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,[1,1,1]),this.reduceType=e,this.shaderKey=`reduce_${e}`}getUserCode(){let t="",e="0.0",o=this.workgroupSize[0];this.reduceType==="min"||this.reduceType==="max"?(t=`
         if (isnan(candidate)) {
          bestValue = uniforms.NAN;
         } else if (!isnan(bestValue) && candidate ${this.reduceType==="min"?"<":">"} bestValue)
           {  bestValue = candidate; }`,e="f32(x[offset])"):this.reduceType==="sum"||this.reduceType==="mean"?t=" bestValue = bestValue + candidate; ":this.reduceType==="prod"?(t=" bestValue = bestValue * candidate; ",e="1.0"):this.reduceType==="all"?(t=" bestValue = f32(bestValue >= 1.0 && candidate >= 1.0); ",e="1.0"):this.reduceType==="any"&&(t=" bestValue = f32(bestValue >= 1.0 || candidate >= 1.0); ",e="0.0");let n=this.reduceType==="mean"?"setOutputAtIndex(outputIndex, bestValue / f32(uniforms.reduceSize));":"setOutputAtIndex(outputIndex, bestValue);";return`
       fn DIV_CEIL(a : u32, b : u32) -> u32 {
        return ((a - 1u) / b + 1u);
       }

       ${`
         var<workgroup> xBestValues : array<f32, ${o}>;
       `}
       fn getOffset(outputIndex : i32) -> i32 {
         let outputCoords = getCoordsFromIndex(outputIndex);
         let offset = ${this.outputShape.length===1?"outputCoords":"outputCoords[0]"} * uniforms.reduceSize;
          return offset;
       }
       ${D("index")} {
         let outputIndex = index / ${o};
         let offset = getOffset(outputIndex);
         var bestValue = ${e};
         let Length = uniforms.reduceSize;
         let WorkPerThread = DIV_CEIL(u32(Length), ${o}u);
         for (var k = i32(localId.x); k < Length && outputIndex < uniforms.size;
             k = k + ${o}) {
           let candidate = f32(x[offset + k]);
           ${t}
         }
         xBestValues[localId.x] = bestValue;
         workgroupBarrier();

         var reduceSize = min(u32(Length), ${o}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (localId.x < currentSize) {
            let candidate = xBestValues[localId.x + interval];
            ${t}
            xBestValues[localId.x] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (localId.x == 0u && outputIndex < uniforms.size) {
          ${n}
        }
       }
     `}};var KD={mean:"float32",all:"bool",any:"bool"};function me(r,t,e,o,n){let s=r.shape.length,i=[],a=S.parseAxisParam(t,r.shape),u=a,p=N.getAxesPermutation(u,s),l=r;p!=null&&(l=Kt({inputs:{x:r},attrs:{perm:p},backend:n}),u=N.getInnerMostAxes(u.length,s),i.push(l)),N.assertAxesAreInnerMostDims(o,u,s);let[c,m]=N.computeOutAndReduceShapes(l.shape,u),f=c;e&&(f=N.expandShapeToKeepDim(c,a));let h;if((o==="max"||o==="prod")&&n.shouldExecuteOnCPU([l])){let b=n.tensorMap.get(l.dataId).values;switch(o){case"max":let x=Rb(b,S.sizeFromShape(m),f,r.dtype);h=n.makeTensorInfo(f,r.dtype,x);break;case"prod":let{outVals:C,outShape:k,outDtype:v}=zb(l.shape,l.dtype,b,u);h=n.makeTensorInfo(k,v,C);break;default:throw new Error(`${o} CPU implementation is not yet supported.`)}}else{let b=S.sizeFromShape(m),C=S.sizeFromShape(l.shape)/b,k={windowSize:b,inSize:b,batchSize:C,outSize:1},v=KD[o]||Ul(r.dtype),I=[{type:"int32",data:[b]}],T=new Ju(k,o,n.device.limits.maxComputeWorkgroupSizeX),R=n.runWebGPUProgram(T,[l],v,I);i.push(R),h=G({inputs:{x:R},attrs:{shape:f},backend:n})}return i.forEach(b=>n.disposeData(b.dataId)),h}function XD(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{keepDims:s,axis:i}=o;return me(n,i,s,"all",e)}var rw={kernelName:"All",backendName:"webgpu",kernelFunc:XD};function jD(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{keepDims:s,axis:i}=o;return me(n,i,s,"any",e)}var ow={kernelName:"Any",backendName:"webgpu",kernelFunc:jD};var Ds=class{constructor(t,e,o){this.workgroupSize=[64,1,1],this.variableNames=["x"],this.uniforms="infinityValue : f32,",this.size=!0;let n=[e];this.op=o==="min"?"<":">";let[s,i]=N.computeOutAndReduceShapes(t,n);this.outputShape=s.length===0?[1]:s,this.dispatchLayout=F(this.outputShape),S.sizeFromShape(i)<32?(this.type="plain",this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize)):(this.type="shared",this.dispatch=A(this.dispatchLayout,this.outputShape,[1,1,1])),this.inputShape=t,this.shaderKey=`argMinMax_${this.op}_${this.type}`}getUserCode(){let t=this.workgroupSize[0],e=()=>this.inputShape.length===1?"uniforms.xShape":`uniforms.xShape.${Fe(this.inputShape.length-1)}`,o=()=>{let n="";if(this.outputShape.length===1)this.inputShape.length!==1&&(n+="outputCoords,");else for(let s=0;s<this.outputShape.length;s++)n+=`outputCoords.${Fe(s)},`;return n};return this.type==="shared"?`
      fn DIV_CEIL(a : u32, b : u32) -> u32 {
        return ((a - 1u) / b + 1u);
      }

      ${`
      var<workgroup> xBestIndices : array<i32, ${t}>;
      var<workgroup> xBestValues : array<f32, ${t}>;
    `}

      ${D("index")} {
        let outputIndex = index / ${t};
        let reduceLength = ${e()};

        var bestIndex = i32(localId.x);
        var bestValue = uniforms.infinityValue;
        let outputCoords = getCoordsFromIndex(outputIndex);
        for (var k = i32(localId.x); k < reduceLength && outputIndex < uniforms.size;
            k = k + ${t}) {
          let candidate = getX(${o()} k);
          if (!isnan(candidate) && candidate ${this.op} bestValue) {
            bestValue = candidate;
            bestIndex = k;
          }
        }
        xBestValues[localId.x] = bestValue;
        xBestIndices[localId.x] = bestIndex;
        workgroupBarrier();

        var reduceSize = min(u32(reduceLength), ${t}u);
        for (var currentSize = reduceSize / 2u; reduceSize > 1u;
            currentSize = reduceSize / 2u) {
          let interval = DIV_CEIL(reduceSize, 2u);
          if (localId.x < currentSize) {
            let candidate = xBestValues[localId.x + interval];
            if (candidate ${this.op} bestValue) {
              bestValue = candidate;
              xBestValues[localId.x] = bestValue;
              xBestIndices[localId.x] = xBestIndices[localId.x + interval];
            }
          }
          reduceSize = interval;
          workgroupBarrier();
        }

        if (localId.x == 0u && outputIndex < uniforms.size) {
          setOutputAtIndexI32(outputIndex, xBestIndices[localId.x]);
        }
      }
    `:`
      ${D("index")} {
        if (index < uniforms.size) {
          let outputCoords = getCoordsFromIndex(index);
          var bestIndex = 0;
          var bestValue = getX(${o()} 0);
          let reduceLength = ${e()};
          for (var i = 1; i < reduceLength; i++) {
            let candidate = getX(${o()} i);
            if (candidate ${this.op} bestValue) {
              bestValue = candidate;
              bestIndex = i;
            }
          }
          setOutputAtIndexI32(index, bestIndex);
        }
      }
      `}};function YD(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{axis:s}=o,i=S.parseAxisParam(s,n.shape),a=N.getAxesPermutation(i,n.shape.length),u=n,p=[];a!=null&&(u=Kt({inputs:{x:n},backend:e,attrs:{perm:a}}),p.push(u),i=N.getInnerMostAxes(i.length,u.shape.length)),N.assertAxesAreInnerMostDims("argMax",[i[0]],u.shape.length);let l=new Ds(u.shape,i[0],"max"),c=[{type:"float32",data:[Number.NEGATIVE_INFINITY]}],m=e.runWebGPUProgram(l,[u],"int32",c);return p.forEach(f=>e.disposeData(f.dataId)),m}var nw={kernelName:Go,backendName:"webgpu",kernelFunc:YD};function ZD(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{axis:s}=o,i=S.parseAxisParam(s,n.shape),a=N.getAxesPermutation(i,n.shape.length),u=n,p=[];a!=null&&(u=Kt({inputs:{x:n},backend:e,attrs:{perm:a}}),p.push(u),i=N.getInnerMostAxes(i.length,u.shape.length)),N.assertAxesAreInnerMostDims("argMin",[i[0]],u.shape.length);let l=new Ds(u.shape,i[0],"min"),c=[{type:"float32",data:[Number.POSITIVE_INFINITY]}],m=e.runWebGPUProgram(l,[u],"int32",c);return p.forEach(f=>e.disposeData(f.dataId)),m}var sw={kernelName:Oo,backendName:"webgpu",kernelFunc:ZD};var QD=j({opType:P.ASIN}),iw={kernelName:Wo,backendName:"webgpu",kernelFunc:QD};var JD=j({opType:P.ASINH}),aw={kernelName:Uo,backendName:"webgpu",kernelFunc:JD};var tA=j({opType:P.ATAN}),uw={kernelName:Vo,backendName:"webgpu",kernelFunc:tA};var eA=ct({opType:q.ATAN2}),pw={kernelName:qo,backendName:"webgpu",kernelFunc:eA};var rA=j({opType:P.ATANH}),lw={kernelName:Ho,backendName:"webgpu",kernelFunc:rA};var tp=class{constructor(t){this.variableNames=["x"],this.uniforms="strides : vec2<i32>,",this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=t.outShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="poolWithFilterSizeEqualsOne"}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let batch = coords[0];
          let d = coords[3];

          let xRCCorner = coords.yz * uniforms.strides;
          let xRCorner = xRCCorner.x;
          let xCCorner = xRCCorner.y;

          let value = getX(batch, xRCorner, xCCorner, d);
          setOutputAtIndex(index, value);
        }
      }
    `}};var nr=class{constructor(t,e,o=!1,n=!1,s=!1){if(this.variableNames=["x"],this.uniforms="strides : vec2<i32>, pads : vec2<i32>, dilations : vec2<i32>, convDims : vec2<i32>, filterDims : vec2<i32>,",this.workgroupSize=[128,1,1],this.size=!0,e==="avg"&&o)throw new Error("Cannot compute positions for average pool.");this.outputShape=t.outShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.poolType=e,this.computePositions=o,this.flattenPositions=n,this.includeBatchIndex=s,this.shaderKey=`pool2D_${e}_${o}_${n}_${s}`}getUserCode(){let t;this.poolType==="avg"?t="resultValue = resultValue + value; count = count + 1.0;":this.computePositions?t=`let currMaxValue = mix(value, maxValue, maxValueFound);
      if (value >= currMaxValue) {
        maxValue = value;
        maxValueFound = 1.0;
        maxPosition = ${this.flattenPositions?this.includeBatchIndex?"((batch * uniforms.xShape[1] + xR) * uniforms.xShape[2] + xC) * uniforms.xShape[3] + d":"(xR * uniforms.xShape[2] + xC) * uniforms.xShape[3] + d":"wR * uniforms.filterDims.y + wC"};
      }`:t="resultValue = max(value, resultValue);";let e="resultValue";return this.poolType==="avg"&&(e="resultValue / max(count, 1.0)"),`
      ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
          let batch = coords[0];
          let d = coords[3];
          let xRCCorner = vec2<i32>(coords.yz) * uniforms.strides - uniforms.pads;
          let xRCorner = xRCCorner.x;
          let xCCorner = xRCCorner.y;

          ${this.computePositions?`var maxValue = 0.0;
            var maxValueFound = 0.0;
            var maxPosition = 0;`:`var resultValue = ${this.poolType==="avg"?"0.0":"-1.0 / pow(10.0, -20.0)"};`}

          var count = 0.0;
          for (var wR = 0; wR < uniforms.filterDims.x; wR = wR + uniforms.dilations.x) {
            let xR = xRCorner + wR;

            if (xR < 0 || xR >= uniforms.convDims.x) {
              continue;
            }

            for (var wC = 0; wC < uniforms.filterDims.y; wC = wC + uniforms.dilations.y) {
              let xC = xCCorner + wC;
              if (xC < 0 || xC >= uniforms.convDims.y) {
                continue;
              }

              let value = getX(batch, xR, xC, d);
              ${t}
            }
          }

          ${this.computePositions?"setOutputAtIndexI32(index, maxPosition);":`setOutputAtIndex(index, ${e});`}
        }
      }
    `}},Kr=class{constructor(t,e,o=!1,n=!1,s=!1){if(this.variableNames=["x"],this.uniforms="strides : vec3<i32>, pads : vec3<i32>, convDims : vec3<i32>, filterDims : vec3<i32>,",this.workgroupSize=[128,1,1],this.size=!0,e==="avg"&&o)throw new Error("Cannot compute positions for average pool.");this.outputShape=t.outShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.poolType=e,this.computePositions=o,this.flattenPositions=n,this.includeBatchIndex=s,this.shaderKey=`pool3D_${e}_${o}_${n}_${s}`}getUserCode(){let t;this.poolType==="avg"?t="resultValue += value; count += 1.0;":this.computePositions?t=`let currMaxValue = mix(value, maxValue, maxValueFound);
      if (value >= currMaxValue) {
        maxValue = value;
        maxValueFound = 1.0;
        maxPosition = ${this.flattenPositions?this.includeBatchIndex?"(((batch * uniforms.xShape.y + xD) * uniforms.xShape.z + xR) * uniforms.xShape.w + xC) * uniforms.xShape.u + ch":"((xD * uniforms.xShape.z + xR) * uniforms.xShape.w + xC) * uniforms.xShape.u + ch":"wD * uniforms.filterDims.y * uniforms.filterDims.y + wR * uniforms.filterDims.z + wC"};
      }`:t="resultValue = max(value, resultValue);";let e="resultValue";return this.poolType==="avg"&&(e="resultValue / max(count, 1.0)"),`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let batch = coords.x;
          let ch = coords.u;

          let xCorner = vec3<i32>(coords.y, coords.z, coords.w) * uniforms.strides - uniforms.pads;
          let xDCorner = xCorner.x;
          let xRCorner = xCorner.y;
          let xCCorner = xCorner.z;

          ${this.computePositions?`var maxValue = 0.0;
            var maxValueFound = 0.0;
            var maxPosition = 0;`:`var resultValue = ${this.poolType==="avg"?"0.0":"-1.0 / pow(10.0, -20.0)"};`}

          var count = 0.0;
          for (var wD = 0; wD < uniforms.filterDims.x; wD++) {
            let xD = xDCorner + wD;
            if (xD < 0 || xD >= uniforms.convDims.x) {
              continue;
            }

            for (var wR = 0; wR < uniforms.filterDims.y; wR++) {
              let xR = xRCorner + wR;
              if (xR < 0 || xR >= uniforms.convDims.y) {
                continue;
              }

              for (var wC = 0; wC < uniforms.filterDims.z; wC++) {
                let xC = xCCorner + wC;
                if (xC < 0 || xC >= uniforms.convDims.z) {
                  continue;
                }

                let value = getX(batch, xD, xR, xC, ch);
                ${t}
              }
            }
          }

          ${this.computePositions?"setOutputAtIndexI32(index, maxPosition);":`setOutputAtIndex(index, ${e});`}
        }
      }
    `}};function Um(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{reductionIndices:s,keepDims:i}=o;return me(n,s,i,"max",e)}var cw={kernelName:"Max",backendName:"webgpu",kernelFunc:Um};function Vm(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{keepDims:s,axis:i}=o;return me(n,i,s,"mean",e)}var mw={kernelName:In,backendName:"webgpu",kernelFunc:Vm};function ep(r,t,e,o){if(t.filterWidth===1&&t.filterHeight===1&&S.arraysEqual(t.inShape,t.outShape))return Nt({inputs:{x:r},backend:o});if(t.filterWidth===t.inWidth&&t.filterHeight===t.inHeight&&t.batchSize===1&&t.padInfo.type==="VALID"){let i=r.shape.length,a=G({inputs:{x:r},backend:o,attrs:{shape:[r.shape[i-3]*r.shape[i-2],r.shape[i-1]]}}),u;e==="avg"?u=Vm({inputs:{x:a},backend:o,attrs:{axis:0,keepDims:!1}}):(S.assert(e==="max",()=>`Invalid pool type ${e}`),u=Um({inputs:{x:a},backend:o,attrs:{reductionIndices:0,keepDims:!1}}));let p=G({inputs:{x:u},backend:o,attrs:{shape:t.outShape}});return o.disposeData(a.dataId),o.disposeData(u.dataId),p}let n,s=[{type:"int32",data:[t.strideHeight,t.strideWidth]}];return t.filterHeight===1&&t.filterWidth===1?n=new tp(t):(e==="avg"?n=new nr(t,"avg"):(S.assert(e==="max",()=>`Invalid pool type ${e}`),n=new nr(t,"max")),s.push({type:"int32",data:[t.padInfo.top,t.padInfo.left]},{type:"int32",data:[t.dilationHeight,t.dilationWidth]},{type:"int32",data:[t.inHeight,t.inWidth]},{type:"int32",data:[t.effectiveFilterHeight,t.effectiveFilterWidth]})),o.runWebGPUProgram(n,[r],r.dtype,s)}function oA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{filterSize:s,strides:i,pad:a,dimRoundingMode:u}=o,l=N.computePool2DInfo(n.shape,s,i,1,a,u);return ep(n,l,"avg",e)}var fw={kernelName:Ko,backendName:"webgpu",kernelFunc:oA};function nA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{filterSize:s,strides:i,pad:a,dataFormat:u,dimRoundingMode:p}=o,l=[1,1,1],c=N.computePool3DInfo(n.shape,s,i,l,a,p,u),m=new Kr(c,"avg"),f=[{type:"int32",data:[c.strideDepth,c.strideHeight,c.strideWidth]},{type:"int32",data:[c.padInfo.front,c.padInfo.top,c.padInfo.left]},{type:"int32",data:[c.inDepth,c.inHeight,c.inWidth]},{type:"int32",data:[c.effectiveFilterDepth,c.effectiveFilterHeight,c.effectiveFilterWidth]}];return e.runWebGPUProgram(m,[n],n.dtype,f)}var dw={kernelName:Xo,backendName:"webgpu",kernelFunc:nA};var rp=class{constructor(t){this.variableNames=["dy"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, dilations : vec2<i32>, filterDims : vec2<i32>,
       outHeight : i32, outWidth : i32, avgMultiplier : f32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.inShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="avgPool2DBackprop"}getUserCode(){return`
      ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d = coords[3];

        let dyRCCorner = vec2<i32>(coords.yz) - uniforms.pads;
        let dyRCorner = dyRCCorner.x;
        let dyCCorner = dyRCCorner.y;

        // Convolve dy(?, ?, d) with pos mask(:, :, d) to get dx(xR, xC, d).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var wR = 0; wR < uniforms.filterDims[0]; wR = wR + uniforms.dilations[0]) {
          let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[0]);

          if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
            continue;
          }
          let idyR = i32(dyR);

          for (var wC = 0; wC < uniforms.filterDims[1]; wC = wC + uniforms.dilations[1]) {
            let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[1]);

            if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
              continue;
            }
            let idyC = i32(dyC);

            let dyValue = getDy(batch, idyR, idyC, d);

            dotProd = dotProd + dyValue * uniforms.avgMultiplier;
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}},op=class{constructor(t){this.variableNames=["dy"],this.uniforms=`strides : vec3<i32>, pads : vec3<i32>, filterDims : vec3<i32>,
       outDepth : i32, outHeight : i32, outWidth : i32, avgMultiplier : f32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.inShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="avgPool3DBackprop"}getUserCode(){return`
      ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords.x;
        let ch = coords.u;

        let dyCorner = vec3<i32>(coords.y, coords.z, coords.w) - uniforms.pads;
        let dyDCorner = dyCorner.x;
        let dyRCorner = dyCorner.y;
        let dyCCorner = dyCorner.z;

        // Convolve dy(?, ?, ?, d) with pos mask(:, :, :, ch) to get
        // dx(xD, xR, xC, ch).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var wD = 0; wD < uniforms.filterDims[0]; wD++) {
          let dyD = f32(dyDCorner + wD) / f32(uniforms.strides[0]);

          if (dyD < 0.0 || dyD >= f32(uniforms.outDepth) || fract(dyD) > 0.0) {
            continue;
          }
          let idyD = i32(dyD);

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[1]);

            if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
              continue;
            }
            let idyR = i32(dyR);

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[2]);

              if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
                continue;
              }
              let idyC = i32(dyC);

              let dyValue = getDy(batch, idyD, idyR, idyC, ch);
              dotProd += dyValue * uniforms.avgMultiplier;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}};function sA(r){let{inputs:t,backend:e,attrs:o}=r,{dy:n,input:s}=t,i=s,{filterSize:a,strides:u,pad:p,dimRoundingMode:l}=o,c=N.computePool3DInfo(i.shape,a,u,1,p,l),m=new op(c),f=1/(c.filterDepth*c.filterHeight*c.filterWidth),h=[{type:"int32",data:[c.strideDepth,c.strideHeight,c.strideWidth]},{type:"int32",data:[c.effectiveFilterDepth-1-c.padInfo.front,c.effectiveFilterHeight-1-c.padInfo.top,c.effectiveFilterWidth-1-c.padInfo.left]},{type:"int32",data:[c.effectiveFilterDepth,c.effectiveFilterHeight,c.effectiveFilterWidth]},{type:"int32",data:[c.outDepth]},{type:"int32",data:[c.outHeight]},{type:"int32",data:[c.outWidth]},{type:"float32",data:[f]}];return e.runWebGPUProgram(m,[n],i.dtype,h)}var hw={kernelName:_i,backendName:"webgpu",kernelFunc:sA};function iA(r){let{inputs:t,backend:e,attrs:o}=r,{dy:n,input:s}=t,i=s;Gu([n,s],"avgPoolGrad");let{filterSize:a,strides:u,pad:p}=o,l=N.computePool2DInfo(i.shape,a,u,1,p),c=new rp(l),m=1/(l.filterHeight*l.filterWidth),f=[{type:"int32",data:[l.strideHeight,l.strideWidth]},{type:"int32",data:[l.effectiveFilterHeight-1-l.padInfo.top,l.effectiveFilterWidth-1-l.padInfo.left]},{type:"int32",data:[l.dilationHeight,l.dilationWidth]},{type:"int32",data:[l.effectiveFilterHeight,l.effectiveFilterWidth]},{type:"int32",data:[l.outHeight]},{type:"int32",data:[l.outWidth]},{type:"float32",data:[m]}];return e.runWebGPUProgram(c,[n],i.dtype,f)}var gw={kernelName:Mi,backendName:"webgpu",kernelFunc:iA};function aA(r){let{inputs:t,backend:e,attrs:o}=r,{a:n,b:s}=t,{transposeA:i,transposeB:a}=o;return Fo({a:n,b:s,transposeA:i,transposeB:a,backend:e})}var xw={kernelName:jo,backendName:"webgpu",kernelFunc:aA};var np=class{constructor(t,e){this.variableNames=["source"],this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.rank=e.length,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.start=t,this.uniforms=`start : ${ht(t.length)}, `,this.shaderKey="slice"}getUserCode(){let t=ht(this.rank),e=uA(this.rank),o;return this.start.length===1?o=this.outputShape.map((s,i)=>"sourceLoc = uniforms.start + coords;"):o=this.outputShape.map((s,i)=>`sourceLoc.${Hm[i]} = uniforms.start.${Fe(i)} + coords.${Hm[i]};`),`
      ${D("index")} {
        if (index < uniforms.size) {
          var sourceLoc : ${t};
          let coords = getCoordsFromIndex(index);
          ${o.join(`
`)}
          setOutputAtIndex(index, getSource(${e}));
        }
      }
    `}},Hm=["x","y","z","w","u","v"];function uA(r){if(r===1)return"sourceLoc";if(r<=6)return Hm.slice(0,r).map(t=>`sourceLoc.${t}`).join(",");throw Error(`Slicing for rank ${r} is not yet supported`)}function qe(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{begin:s,size:i}=o,[a,u]=be.parseSliceParams(n,s,i);if(be.assertParamsValid(n,a,u),e.shouldExecuteOnCPU([n])||n.dtype==="string"){let c=e.tensorMap.get(n.dataId),m=Ub(c.values,a,u,n.shape,n.dtype);return e.makeTensorInfo(u,n.dtype,m)}if(S.sizeFromShape(u)===0)return e.makeTensorInfo(u,n.dtype,[]);let p=new np(a,u),l=[{type:"int32",data:a}];return e.runWebGPUProgram(p,[n],n.dtype,l)}var yw={kernelName:Yr,backendName:"webgpu",kernelFunc:qe};var pA=r=>{let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{blockShape:s,crops:i}=o;S.assert(n.shape.length<=4,()=>"batchToSpaceND for rank > 4 with a WebGPU backend not implemented yet");let a=s.reduce((k,v)=>k*v),u=N.getReshaped(n.shape,s,a),p=N.getPermuted(u.length,s.length),l=N.getReshapedPermuted(n.shape,s,a),c=N.getSliceBeginCoords(i,s.length),m=N.getSliceSize(l,i,s.length),f=[],h=G({inputs:{x:n},backend:e,attrs:{shape:u}}),b=Kt({inputs:{x:h},backend:e,attrs:{perm:p}}),x=G({inputs:{x:b},backend:e,attrs:{shape:l}}),C=qe({inputs:{x},backend:e,attrs:{begin:c,size:m}});return f.push(h),f.push(b),f.push(x),f.forEach(k=>e.disposeData(k.dataId)),C},bw={kernelName:Yo,backendName:"webgpu",kernelFunc:pA};var lA=`
  fn bincount_write(index: i32, value: f32) {
    ${pe("&result[index]","value","float32")}
  }
`,cA=`
  fn bincount_write(index: i32, value: f32) {
    atomicStore(&result[index], bitcast<i32>(value));
  }
`,As=class{constructor(t,e,o=!1){this.outputShape=[],this.variableNames=["x"],this.uniforms="binCountSize : i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.hasWeights=!0,this.binaryOutput=!1,this.outputShape=t,this.rank=t.length,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.binaryOutput=o,o&&(this.atomic=!1),this.hasWeights=e,this.hasWeights&&this.variableNames.push("w"),this.shaderKey=`bincount_${this.hasWeights}_${this.binaryOutput}_${this.rank}`}getUserCode(){return`
    ${this.binaryOutput?cA:lA}
  ${D("index")} {
    ${this.rank===1?`if (index < uniforms.xShape) {
      let indexVal = i32(getX(index));
      if (indexVal < uniforms.binCountSize) {
        let value = ${this.binaryOutput?1:this.hasWeights?"getW(index)":"1."};
        bincount_write(indexVal, value);
      }
    }`:`let coord = getCoordsFromIndex(index);
    if (coordsInBounds2D(coord, uniforms.xShape)) {
      let indexVal = i32(getX(coord[0], coord[1]));
      if (indexVal < uniforms.binCountSize) {
        let value = ${this.binaryOutput?1:this.hasWeights?"getW(coord[0], coord[1])":"1."};
        bincount_write(coord.x * uniforms.binCountSize + indexVal, value);
      }
    }`}
  }
  `}};function mA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,weights:s}=t,{size:i}=o,a=S.sizeFromShape(n.shape),p=S.sizeFromShape(s.shape)>0,l=[i],c=s.dtype,m=Ct({backend:e,attrs:{shape:l,value:0,dtype:c}}),f=new As([a],p),h=[{type:"int32",data:[i]}],b=p?[n,s]:[n];return e.runWebGPUProgram(f,b,c,h,m)}var ww={kernelName:Bi,backendName:"webgpu",kernelFunc:mA};var sp=class{constructor(t){this.outputShape=[],this.variableNames=["s0","s1"],this.uniforms="s0Size : i32, s1Size : i32, ",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[t],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="broadcastArgs"}getUserCode(){return`
  ${D("index")} {
    if (index < uniforms.size) {
      var s0 = 1.0;
      var s1 = 1.0;
      let indexS0 = index - uniforms.size + uniforms.s0Size;
      let indexS1 = index - uniforms.size + uniforms.s1Size;
      if (indexS0 >= 0) {
        s0 = getS0(indexS0);
      }
      if (indexS1 >= 0) {
        s1 = getS1(indexS1);
      }

      if (s0 == 1.0) {
        setOutputAtIndex(index, s1);
      } else if (s1 == 1.0) {
        setOutputAtIndex(index, s0);
      } else if (s0 != s1) {
        setOutputAtIndex(index, uniforms.NAN);
      } else {
        setOutputAtIndex(index, s0);
      }
    }
  }
  `}};function fA(r){let{inputs:t,backend:e}=r,{s0:o,s1:n}=t;if(e.shouldExecuteOnCPU([o,n])){let l=e.tensorMap.get(o.dataId),c=e.tensorMap.get(n.dataId),m=l.values,f=c.values,h=N.assertAndGetBroadcastShape(Array.from(m),Array.from(f));return e.makeTensorInfo([h.length],"int32",Int32Array.from(h))}let s=S.sizeFromShape(o.shape),i=S.sizeFromShape(n.shape),a=Math.max(s,i),u=new sp(a),p=[{type:"int32",data:[s]},{type:"int32",data:[i]}];return e.runWebGPUProgram(u,[o,n],"int32",p)}var Sw={kernelName:Li,backendName:"webgpu",kernelFunc:fA};var qm=ct({opType:q.NOT_EQUAL,dtype:"bool",cpuKernelImpl:Bb}),Cw={kernelName:$n,backendName:"webgpu",kernelFunc:qm};function kr(r){let{inputs:t,backend:e}=r,{input:o}=t,n=e.tensorMap.get(o.dataId);return Nt({inputs:{x:n.complexTensorInfos.real},backend:e})}var vw={kernelName:Os,backendName:"webgpu",kernelFunc:kr};function kw(r,t){let e=new ce(r.shape,P.TO_INT),o=t.runWebGPUProgram(e,[r],"int32");return{dataId:o.dataId,shape:o.shape,dtype:o.dtype}}function Km(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{dtype:s}=o;if(s==="complex64"){if(n.dtype==="complex64")return Nt({inputs:{x:n},backend:e});let i=ye(n.shape),a=Km({inputs:{x:n},backend:e,attrs:{dtype:"float32"}}),u=Se({inputs:{real:a,imag:i},backend:e});return i.dispose(),e.disposeData(a.dataId),u}if(n.dtype==="complex64"){let i=kr({inputs:{input:n},backend:e}),a=Km({inputs:{x:i},backend:e,attrs:{dtype:s}});return e.disposeData(i.dataId),a}if(!S.hasEncodingLoss(n.dtype,s)){let i=Nt({inputs:{x:n},backend:e});return{dataId:i.dataId,shape:i.shape,dtype:s}}if(e.shouldExecuteOnCPU([n])){let i=e.tensorMap.get(n.dataId).values,[a,u,p]=xb(i,n.shape,n.dtype,s);return e.makeTensorInfo(a,u,p)}if(s==="int32")return kw(n,e);if(s==="bool"){let i=e.makeTensorInfo([],"bool",S.getTypedArrayFromDType("bool",1)),u=qm({inputs:{a:n,b:i},backend:e});return e.disposeData(i.dataId),u}throw new Error(`Error in Cast: failed to cast ${n.dtype} to ${s}`)}var Iw={kernelName:ir,backendName:"webgpu",kernelFunc:Km};var dA=j({opType:P.CEIL,cpuKernelImpl:yb}),Ew={kernelName:Er,backendName:"webgpu",kernelFunc:dA};var ip=class{constructor(t){this.variableNames=["A"],this.uniforms="minVal : f32, maxVal : f32,",this.workPerThread=4,this.workgroupSize=[64,1,1],this.outputComponent=4,this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.shaderKey="clipVec4"}getUserCode(){return`
      ${D("index")} {
        if(index < uniforms.size) {
          let value = getAByOutputIndex(index);
          var clampedValue = clamp(
              value, vec4<f32>(uniforms.minVal), vec4<f32>(uniforms.maxVal));
          clampedValue = select(clampedValue, value, isnanVec4(value));
          setOutputAtIndex(index, clampedValue);
        }
      }
    `}};var ap=class{constructor(t){this.variableNames=["A"],this.uniforms="minVal : f32, maxVal : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="clip"}getUserCode(){return`
      ${D("index")} {
        if(index < uniforms.size) {
          let value = getAByOutputIndex(index);
          if (isnan(value)) {
            setOutputAtIndex(index, value);
            return;
          }
          setOutputAtIndex(index, clamp(value, uniforms.minVal, uniforms.maxVal));
        }
      }
    `}};function hA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{clipValueMin:s,clipValueMax:i}=o,a,u=[{type:"float32",data:[s]},{type:"float32",data:[i]}];return S.sizeFromShape(n.shape)%4===0?a=new ip(n.shape):a=new ap(n.shape),e.runWebGPUProgram(a,[n],n.dtype,u)}var $w={kernelName:Zo,backendName:"webgpu",kernelFunc:hA};var up=class{constructor(t){this.outputShape=[],this.variableNames=["real","imag"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="complexAbs"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.size) {
        let re = abs(getRealByOutputIndex(index));
        let im = abs(getImagByOutputIndex(index));
        let mx = max(re, im);

        // The length function in wgsl may be not underflow-safe on some GPUs.
        // So the safe solution is to ensure underflow-safety in all cases.
        setOutputAtIndex(index, select(mx * length(vec2<f32>(1, min(re, im)/mx)), 0.0, mx == 0.0));
      }
    }
  `}};function Nw(r,t){return{dataId:t.dataId,dtype:t.dtype,shape:r.shape}}function gA(r){let{inputs:t,backend:e}=r,{x:o}=t,n=e.tensorMap.get(o.dataId),s=new up(o.shape),i=[Nw(o,n.complexTensorInfos.real),Nw(o,n.complexTensorInfos.imag)];return e.runWebGPUProgram(s,i,i[0].dtype)}var Tw={kernelName:Qo,backendName:"webgpu",kernelFunc:gA};var pp=class{constructor(t){this.uniforms="",this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=N.computeOutShape(t,1),this.variableNames=t.map((e,o)=>`T${o}`),this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]),this.offsetLength=t.length-1;for(let e=0;e<this.offsetLength;e++)this.uniforms+=`offset${e} : i32,`;this.shaderKey="concat"}getUserCode(){let t=[];if(this.offsetLength>0){t.push("if (yC < uniforms.offset0){ setOutputAtCoords(coords.x, coords.y, getT0(yR, yC)); }");for(let s=1;s<this.offsetLength;s++)t.push(`else if (yC < uniforms.offset${[s]}){ setOutputAtCoords(coords.x, coords.y, getT${s}(yR, yC - uniforms.offset${s-1})); }`);let o=this.offsetLength,n=this.offsetLength-1;t.push(`else { setOutputAtCoords(coords.x, coords.y, getT${o}(yR, yC - uniforms.offset${n})); }`)}else t.push("setOutputAtCoords(coords.x, coords.y, getT0(yR, yC));");return`
      ${D("index")} {
        for(var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let flatIndex = index * ${this.workPerThread} + i;
          if(flatIndex < uniforms.size) {
            let coords = getCoordsFromIndex(flatIndex);
            let yR = coords.x;
            let yC = coords.y;

            ${t.join(`
        `)}
          }
        }
      }
    `}};function Po(r){let{inputs:t,backend:e}=r,{input:o}=t,n=e.tensorMap.get(o.dataId);return Nt({inputs:{x:n.complexTensorInfos.imag},backend:e})}var Dw={kernelName:ia,backendName:"webgpu",kernelFunc:Po};function Rs(r,t,e){let o=r[0].dtype;if(o==="complex64"){let h=r.map(v=>kr({inputs:{input:v},backend:e})),b=r.map(v=>Po({inputs:{input:v},backend:e})),x=Rs(h,t,e),C=Rs(b,t,e),k=Se({inputs:{real:x,imag:C},backend:e});return h.forEach(v=>e.disposeData(v.dataId)),b.forEach(v=>e.disposeData(v.dataId)),e.disposeData(x.dataId),e.disposeData(C.dataId),k}let n=e.shouldExecuteOnCPU(r);if(o==="string"&&(n=!0),n){let h=r.map(T=>{let M=[-1,S.sizeFromShape(T.shape.slice(t))];return G({inputs:{x:T},backend:e,attrs:{shape:M}})}),b=h.map(T=>({vals:e.readSync(T.dataId),shape:T.shape})),x=N.computeOutShape(h.map(T=>T.shape),1),C=h[0].shape[0]===1,k=bb(b,x,o,C),v=N.computeOutShape(r.map(T=>T.shape),t),I=e.makeTensorInfo(v,o,k);return h.forEach(T=>e.disposeData(T.dataId)),I}let s=e.device.limits.maxStorageBuffersPerShaderStage-1;if(r.length>s){let h=[];for(let x=0;x<r.length;x+=s){let C=r.slice(x,x+s);h.push(Rs(C,t,e))}let b=Rs(h,t,e);for(let x of h)e.disposeData(x.dataId);return b}let{tensors2D:i,outShape:a}=xA(r,t,e),u=i.map(h=>h.shape),p=new pp(u),l=[],c=new Array(u.length-1);if(c.length>0){c[0]=u[0][1],l.push({type:"int32",data:[c[0]]});for(let h=1;h<c.length;h++)c[h]=c[h-1]+u[h][1],l.push({type:"int32",data:[c[h]]})}let m=e.runWebGPUProgram(p,i,i[0].dtype,l);i.forEach(h=>e.disposeData(h.dataId));let f=G({inputs:{x:m},backend:e,attrs:{shape:a}});return e.disposeData(m.dataId),f}function xA(r,t,e){let o=N.computeOutShape(r.map(s=>s.shape),t);return{tensors2D:r.map(s=>G({inputs:{x:s},backend:e,attrs:{shape:[S.sizeFromShape(s.shape.slice(0,t)),S.sizeFromShape(s.shape.slice(t))]}})),outShape:o}}function Xm(r){let{inputs:t,backend:e,attrs:o}=r,{axis:n}=o,s=S.parseAxisParam(n,t[0].shape)[0],i=t.map(p=>p.shape);N.assertParamsConsistent(i,s);let a=N.computeOutShape(t.map(p=>p.shape),s);if(S.sizeFromShape(a)===0)return e.makeTensorInfo(a,t[0].dtype,[]);let u=t.filter(p=>S.sizeFromShape(p.shape)>0);return u.length===1?Nt({inputs:{x:u[0]},backend:e}):Rs(u,s,e)}var Aw={kernelName:Jo,backendName:"webgpu",kernelFunc:Xm};function yA(r,t,e,o,n=!1,s=null,i=!1,a=4,u=4,p=4){let l=B=>{switch(B){case 1:return"resData = f32(x[xIndex]);";case 3:return"resData = vec3<f32>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);";case 4:return"resData = vec4<f32>(x[xIndex / 4]);";default:throw new Error(`innerElementSize ${B} is not supported.`)}},c=B=>{switch(B){case 1:return"return f32(W[row * uniforms.wShape[3] + col]);";case 4:return"return vec4<f32>(W[(row * uniforms.wShape[3] + col) / 4]);";default:throw new Error(`innerElementSize ${B} is not supported.`)}},m=r?`
      let coord = vec4<i32>(batch, xRow, xCol, xCh);
      `:`
      let coord = vec4<i32>(batch, xCh, xRow, xCol);
      `,f=r?`
      let coords = vec4<i32>(
        batch,
        row / outWidth,
        row % outWidth,
        col);
      `:`
      let coords = vec4<i32>(
        batch,
        row,
        col / outWidth,
        col % outWidth);
      `,h=r?"uniforms.xShape[1]":"uniforms.xShape[2]",b=r?"uniforms.xShape[2]":"uniforms.xShape[3]",x=r?"row":"col",C=r?"col":"row",k=`
      let inChannels = uniforms.wShape[2];
      let outWidth = ${r?"uniforms.outShape[2]":"uniforms.outShape[3]"};
      let outRow = ${x} / outWidth;
      let outCol = ${x} % outWidth;

      let WRow = ${C} / (uniforms.filterDims[1] * inChannels);
      let WCol = ${C} / inChannels % uniforms.filterDims[1];
      let xRow = outRow * uniforms.strides[0] + uniforms.dilations[0] * WRow - uniforms.pads[0];
      let xCol = outCol * uniforms.strides[1] + uniforms.dilations[1] * WCol - uniforms.pads[1];
      let xCh = ${C} % inChannels;
      var resData = ${et(a)}(0.0);
      // The bounds checking is always needed since we use it to pad zero for
      // the 'same' padding type.
      if (xRow >= 0 && xRow < ${h} && xCol >= 0 && xCol < ${b}) {
        ${m}
        let xIndex = getIndexFromCoords4D(coord, uniforms.xShape);
        ${l(a)}
      }
      return resData;`,v=r?t&&o?`
      ${k}`:`
      if (row < uniforms.dimAOuter && col < uniforms.dimInner) {
        ${k}
      }
      return ${et(a)}(0.0);`:o&&e?`
      ${k}`:`
      if (row < uniforms.dimInner && col < uniforms.dimBOuter) {
        ${k}
      }
      return ${et(a)}(0.0);`,I=`${c(u)}`,T=et(p),R=r?et(a):et(u),M=r?et(u):et(a);return`
      ${Vt(s,i,p===4,4)}
      fn mm_readA(batch: i32, row : i32, col : i32) -> ${R} {
        ${r?v:I}
      }

      fn mm_readB(batch: i32, row : i32, col : i32) -> ${M} {
        ${r?I:v}
      }

      fn mm_write(batch: i32, row : i32, col : i32, valueIn : ${T}) {
        if (row < uniforms.dimAOuter && col < uniforms.dimBOuter)
        {
        var value = valueIn;
        let outWidth = ${r?"uniforms.outShape[2]":"uniforms.outShape[3]"};
        ${f}
        ${le(n,s)}
        setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
        }
      }`}var lp=class{constructor(t,e,o,n,s=!1,i=null,a=!1,u=!1){this.variableNames=["x","W"],this.uniforms="filterDims : vec2<i32>, pads : vec2<i32>, strides : vec2<i32>, dilations : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.outputShape=t.outShape,this.isChannelsLast=t.dataFormat==="channelsLast",this.isVec4=((t.inChannels%4===0||t.inChannels%3===0)&&this.isChannelsLast||t.outWidth%4===0&&!this.isChannelsLast)&&t.outChannels%4===0,this.dispatchLayout=this.isChannelsLast?{x:[3],y:[1,2],z:[0]}:{x:[2,3],y:[1],z:[0]},this.workgroupSize=Bu(this.dispatchLayout,this.outputShape,this.isVec4),this.elementsPerThread=zu(this.dispatchLayout,this.outputShape,this.isVec4),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,this.elementsPerThread),this.isVec4?(this.outputComponent=4,this.isChannelsLast&&t.inChannels%4!==0?(this.innerElementSize=3,this.variableComponents=[1,4]):(this.innerElementSize=4,this.variableComponents=[4,4]),s&&(this.variableNames.push("bias"),this.variableComponents.push(4)),a&&(this.variableNames.push("preluActivationWeights"),this.variableComponents.push(4))):(this.innerElementSize=this.elementsPerThread[0],s&&this.variableNames.push("bias"),a&&this.variableNames.push("preluActivationWeights")),this.sequentialAccessByThreads=u,this.addBias=s,this.activation=i,this.hasPreluActivationWeights=a,this.tileAOuter=this.workgroupSize[1]*this.elementsPerThread[1],this.tileBOuter=this.workgroupSize[0]*this.elementsPerThread[0],this.tileInner=Math.max(this.workgroupSize[0]*this.innerElementSize,this.workgroupSize[1]),this.fitAOuter=e%this.tileAOuter===0,this.fitBOuter=o%this.tileBOuter===0,this.fitInner=n%this.tileInner===0,this.shaderKey=`conv2DMM_${this.elementsPerThread}_${this.activation}}_${this.fitAOuter}_${this.fitBOuter}_${this.fitInner}_${this.isVec4}_${this.innerElementSize}_${this.isChannelsLast}_${this.sequentialAccessByThreads}`}getUserCode(){let t=this.isVec4?Ao(this.elementsPerThread,this.workgroupSize,!this.isChannelsLast,this.tileInner):Ro(this.elementsPerThread,this.workgroupSize,!this.isChannelsLast,this.tileInner,!1,null,this.sequentialAccessByThreads),e=this.isVec4?[this.innerElementSize,4,4]:[1,1,1];return`
    ${yA(this.isChannelsLast,this.fitAOuter,this.fitBOuter,this.fitInner,this.addBias,this.activation,this.hasPreluActivationWeights,e[0],e[1],e[2])}
    ${t}
  `}};var cp=class{constructor(t,e=!1,o=null,n=!1){this.variableNames=["x","W"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>,",this.workgroupSize=[4,4,8],this.outputShape=t.outShape,this.isChannelsLast=t.dataFormat==="channelsLast",this.dispatchLayout=this.isChannelsLast?{x:[2],y:[1],z:[0,3]}:{x:[3],y:[2],z:[0,1]},this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.addBias=e,this.activation=o,this.hasPreluActivationWeights=n,e&&this.variableNames.push("bias"),n&&this.variableNames.push("preluActivationWeights"),this.shaderKey=`conv2dnaive_${this.activation}_${this.isChannelsLast}`}getUserCode(){return`
       ${Vt(this.activation,this.hasPreluActivationWeights,!1,4)}
       fn readInp(batch : i32, row : i32, col : i32, chan : i32) -> f32{
         let coords = vec4<i32>(batch, row, col, chan);
         if (coordsInBounds4D(coords, uniforms.xShape)) {
           return  getX(batch, row, col, chan);
         } else {
          return 0.0;
         }
       }
       fn readFilt(row : i32, col : i32, xChannel : i32, outChannel : i32) -> f32{
         let coords = vec4<i32>(row, col, xChannel, outChannel);
         if(coordsInBounds4D(coords, uniforms.wShape)) {
           return getW(row, col, xChannel, outChannel);
          } else {
            return 0.0;
          }
       }
       fn writeResult(batch : i32, row : i32, col : i32, chan : i32, valueIn : f32) {
         let coords = ${this.isChannelsLast?"vec4<i32>(batch, row, col, chan);":"vec4<i32>(batch, chan, row, col);"}
         if (coordsInBounds4D(coords, uniforms.outShape)) {
           var value = valueIn;
           ${le(this.addBias,this.activation)}
           setOutputAtCoords(coords.x, coords.y, coords.z, coords.w, value);
         }
       }
       ${D("index")} {
         let coords = getOutputCoords();
         let batch = coords[0];
         let outChannel = ${this.isChannelsLast?"coords[3];":"coords[1];"}
         let outRow = ${this.isChannelsLast?"coords[1];":"coords[2];"}
         let outCol = ${this.isChannelsLast?"coords[2];":"coords[3];"}
         var acc : f32 = 0.0;
         for (var row = 0; row < uniforms.filterDims[0]; row = row + 1) {
           for (var col = 0; col < uniforms.filterDims[1]; col = col + 1) {
             let xRow = outRow * uniforms.strides[0] + uniforms.dilations[0] * row - uniforms.pads[0];
             let xCol = outCol * uniforms.strides[1] + uniforms.dilations[1] * col - uniforms.pads[1];
             for (var xChannel = 0; xChannel < ${this.isChannelsLast?"uniforms.xShape[3];":"uniforms.xShape[1];"} xChannel = xChannel + 1) {
               ${this.isChannelsLast?"let v = readInp(batch, xRow, xCol, xChannel);":"let v = readInp(batch, xChannel, xRow, xCol);"}
               let f = readFilt(row, col, xChannel, outChannel);
               acc = acc + v * f;
             }
           }
         }
         writeResult(batch, outRow, outCol, outChannel, acc);
       }
     `}};var mp=class{constructor(t,e){this.variableNames=["x"],this.uniforms=`pads : vec2<i32>, strides : vec2<i32>, dilations : vec2<i32>, outWidth : i32, itemsPerBlockRow : i32,
       inChannels : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.isChannelsLast=e,this.shaderKey=`im2col_${this.isChannelsLast}`}getUserCode(){let t=this.isChannelsLast?1:2,e=this.isChannelsLast?2:3,o=this.isChannelsLast?"coords[1]":"coords[2]",n=this.isChannelsLast?"coords[2]":"coords[1]",s=this.isChannelsLast?"getX(batch, xRow, xCol, ch)":"getX(batch, ch, xRow, xCol)";return`
    ${D("index")} {
      let coords = getCoordsFromIndex(index);
      if(index < uniforms.size) {
        let batch = coords[0];
        let row = ${o};
        let col = ${n};
        let offsetY = (row / uniforms.outWidth) * uniforms.strides[0] - uniforms.pads[0];
        let xRow = offsetY + uniforms.dilations[0] * (col / uniforms.itemsPerBlockRow);
        var value = 0.0;
        if(xRow < uniforms.xShape[${t}] && xRow >= 0) {
          let offsetX = (row % uniforms.outWidth) * uniforms.strides[1] -
              uniforms.pads[1];
          let xCol = offsetX + uniforms.dilations[1] * ((col %
              uniforms.itemsPerBlockRow) / uniforms.inChannels);
          let ch = col % uniforms.inChannels;
          if(xCol < uniforms.xShape[${e}] && xCol >= 0) {
            value = ${s};
          }
        }
        setOutputAtIndex(index, value);
      }
    }
   `}};function fp(r,t){let e=r.length;return e>=3?t?[...r.slice(0,-3),r[e-3]*r[e-2],r[e-1]]:[...r.slice(0,-3),r[e-3],r[e-2]*r[e-1]]:!t&&e===1&&r[0]>1?[r[0],1]:null}function bA({x:r,filter:t,convInfo:e,backend:o,bias:n=null,preluActivationWeights:s=null,leakyreluAlpha:i=0,activation:a=null}){let u=e.dataFormat==="channelsLast",p=!u,l=!1,c=u&&e.filterHeight===e.inHeight&&e.filterWidth===e.inWidth&&e.padInfo.type==="VALID",m=[],f,h;if(c){let C=e.inHeight*e.inWidth*e.inChannels;f=G({inputs:{x:r},backend:o,attrs:{shape:[1,e.batchSize,C]}}),h=G({inputs:{x:t},backend:o,attrs:{shape:[1,C,e.outChannels]}})}else f=G({inputs:{x:r},backend:o,attrs:{shape:u?[e.batchSize,e.inHeight*e.inWidth,e.inChannels]:[e.batchSize,e.inChannels,e.inHeight*e.inWidth]}}),h=G({inputs:{x:t},backend:o,attrs:{shape:[1,e.inChannels,e.outChannels]}});if(m.push(f),m.push(h),s!=null){let C=fp(s.shape,u);C!=null&&(s=G({inputs:{x:s},backend:o,attrs:{shape:C}}),m.push(s))}if(n!=null){let C=fp(n.shape,u);C!=null&&(n=G({inputs:{x:n},backend:o,attrs:{shape:C}}),m.push(n))}let b=Fo({a:u?f:h,b:u?h:f,transposeA:p,transposeB:l,backend:o,bias:n,activation:a,preluActivationWeights:s,leakyreluAlpha:i}),x=G({inputs:{x:b},backend:o,attrs:{shape:e.outShape}});m.push(b);for(let C of m)o.disposeData(C.dataId);return x}function wA({x:r,filter:t,convInfo:e,backend:o,bias:n=null,preluActivationWeights:s=null,leakyreluAlpha:i=0,activation:a=null}){let{filterWidth:u,filterHeight:p,inChannels:l,strideWidth:c,strideHeight:m,padInfo:f,outWidth:h,outHeight:b,dilationWidth:x,dilationHeight:C,dataFormat:k}=e,v=k==="channelsLast",I=u*p*l,T=b*h,R=v?[e.batchSize,T,I]:[e.batchSize,I,T],M=new mp(R,v),z=[{type:"int32",data:[f.top,f.left]},{type:"int32",data:[m,c]},{type:"int32",data:[C,x]},{type:"int32",data:[h]},{type:"int32",data:[l*u]},{type:"int32",data:[l]}],B=o.runWebGPUProgram(M,[r],r.dtype,z),H=[];H.push(B);let Y=G({inputs:{x:t},backend:o,attrs:{shape:[1,I,-1]}});if(H.push(Y),s!=null){let Tt=fp(s.shape,v);Tt!=null&&(s=G({inputs:{x:s},backend:o,attrs:{shape:Tt}}),H.push(s))}if(n!=null){let Tt=fp(n.shape,v);Tt!=null&&(n=G({inputs:{x:n},backend:o,attrs:{shape:Tt}}),H.push(n))}let ut=Fo({a:v?B:Y,b:v?Y:B,transposeA:!v,transposeB:!1,backend:o,bias:n,activation:a,preluActivationWeights:s,leakyreluAlpha:i}),pt=G({inputs:{x:ut},backend:o,attrs:{shape:e.outShape}});H.push(ut);for(let Tt of H)o.disposeData(Tt.dataId);return pt}function dp({x:r,filter:t,convInfo:e,backend:o,bias:n=null,preluActivationWeights:s=null,leakyreluAlpha:i=0,activation:a=null}){let u=n!=null,p=s!=null,l=e.dataFormat==="channelsLast",c=l&&e.filterHeight===e.inHeight&&e.filterWidth===e.inWidth&&e.padInfo.type==="VALID",m=L().getBool("WEBGPU_USE_NAIVE_CONV2D_DEBUG");if(!m&&(c||e.filterHeight===1&&e.filterWidth===1&&e.dilationHeight===1&&e.dilationWidth===1&&e.strideHeight===1&&e.strideWidth===1&&(e.padInfo.type==="SAME"||e.padInfo.type==="VALID")))return bA({x:r,filter:t,convInfo:e,backend:o,bias:n,activation:a,preluActivationWeights:s,leakyreluAlpha:i});let f=L().getNumber("WEBGPU_THRESHOLD_TO_INCREASE_WORKGROUPS_FOR_MATMUL"),h=f>-1?f:o.thresholdToIncreaseWorkgroups,b=e.batchSize*Math.ceil(e.outHeight*e.outWidth/32)*Math.ceil(e.outChannels/32);if(L().getBool("WEBGPU_CONV_SEPARATE_IM2COL_SHADER")||b<=h)return wA({x:r,filter:t,convInfo:e,backend:o,bias:n,preluActivationWeights:s,leakyreluAlpha:i,activation:a});let x,C=[e.padInfo.top,e.padInfo.left],k=[{type:"int32",data:[e.filterHeight,e.filterWidth]},{type:"int32",data:[...C]},{type:"int32",data:[e.strideHeight,e.strideWidth]},{type:"int32",data:[e.dilationHeight,e.dilationWidth]}];if(m)x=new cp(e,u,a,p);else{let R=l?e.outHeight*e.outWidth:e.outChannels,M=l?e.outChannels:e.outHeight*e.outWidth,z=e.filterHeight*e.filterWidth*e.inChannels;k.push({type:"int32",data:[R]},{type:"int32",data:[M]},{type:"int32",data:[z]});let B=o.adapterInfo.isIntel();x=new lp(e,R,M,z,u,a,p,B)}let v=[],I=[r,t];u&&(!l&&n.shape.length===1&&(n=G({inputs:{x:n},backend:o,attrs:{shape:[n.shape[0],1,1]}}),v.push(n)),I.push(n)),p&&(!l&&s.shape.length===1&&(s=G({inputs:{x:s},backend:o,attrs:{shape:[s.shape[0],1,1]}}),v.push(s)),I.push(s)),a==="leakyrelu"&&(k.push({type:"float32",data:[i]}),x.uniforms+=" alpha : f32,");let T=o.runWebGPUProgram(x,I,r.dtype,k);for(let R of v)o.disposeData(R.dataId);return T}function SA(r){let{inputs:t,attrs:e,backend:o}=r,{x:n,filter:s}=t,{strides:i,pad:a,dataFormat:u,dilations:p,dimRoundingMode:l}=e,c=N.convertConv2DDataFormat(u),m=N.computeConv2DInfo(n.shape,s.shape,i,p,a,l,!1,c);return dp({x:n,filter:s,convInfo:m,backend:o})}var Rw={kernelName:tn,backendName:"webgpu",kernelFunc:SA};var hp=class{constructor(t){this.variableNames=["dy","W"],this.uniforms="filterDims : vec2<i32>, pads : vec2<i32>, strides : vec2<i32>, outBackprop : vec4<i32>,",this.workgroupSize=[64,1,1],this.size=!1,this.isVec4=!1,this.workPerThread=1,this.outputShape=t.inShape,this.isChannelsLast=t.dataFormat==="channelsLast",this.isVec4=this.isChannelsLast&&t.outChannels%4===0&&t.inChannels%4===0,this.isVec4?(this.workPerThread=2,this.outputComponent=4,this.workgroupSize=[4,4,4],this.dispatchLayout={x:[3],y:[2],z:[0,1]},this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[4,this.workPerThread,1])):(this.size=!0,this.workPerThread=1,this.workgroupSize=[64,1,1],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize)),this.shaderKey=`conv2DDerInput_${this.isChannelsLast}_${this.isVec4}_${this.workPerThread}`}getUserCode(){let t=this.isChannelsLast?1:2,e=this.isChannelsLast?2:3,o=this.isChannelsLast?3:1,n=`
    ${D()} {
      let batch = i32(globalId.z) / uniforms.outShape[1];
      let r = i32(globalId.z) % uniforms.outShape[1];
      let c = i32(globalId.y) * ${this.workPerThread};
      let d1 = i32(globalId.x) * 4;

      let dyCorner = vec2<i32>(r, c) - uniforms.pads;

      // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
      // ? = to be determined. : = across all values in that axis.
      var dotProd: array<vec4<f32>, ${this.workPerThread}>;
      for (var i = 0; i < ${this.workPerThread}; i++) {
        dotProd[i] = vec4<f32>(0.0);
      }
      for (var wR = 0; wR < uniforms.filterDims.x; wR = wR + 1) {
        let dyR = f32(dyCorner.x + wR) / f32(uniforms.strides.x);
        let wRPerm = uniforms.filterDims.x - 1 - wR;
        if (dyR < 0.0 || dyR >= f32(uniforms.outBackprop[1]) ||
            fract(dyR) > 0.0) {
          continue;
        }
        let idyR = i32(dyR);

        for (var wC = 0; wC < uniforms.filterDims.y; wC = wC + 1) {
          let dyC = f32(dyCorner.y + wC) / f32(uniforms.strides.y);
          let dyC2 = f32(dyCorner.y + 1 + wC) / f32(uniforms.strides.y);
          let wCPerm = uniforms.filterDims.y - 1 - wC;
          var bDyCVal = true;
          var bDyCVal2 = true;
          if (dyC < 0.0 || dyC >= f32(uniforms.outBackprop[2]) ||
              fract(dyC) > 0.0) {
            bDyCVal = false;
          }
          if (dyC2 < 0.0 || dyC2 >= f32(uniforms.outBackprop[2]) ||
              fract(dyC2) > 0.0) {
            bDyCVal2 = false;
          }

          let idyC = i32(dyC);
          let idyC2 = i32(dyC2);
          if (bDyCVal && bDyCVal2) {
            let d2Length = uniforms.outBackprop[3];
            for (var d2 = 0; d2 < d2Length; d2 = d2 + 4) {
              let wValue0 = getW(wRPerm, wCPerm, d1, d2);
              let wValue1 = getW(wRPerm, wCPerm, d1 + 1, d2);
              let wValue2 = getW(wRPerm, wCPerm, d1 + 2, d2);
              let wValue3 = getW(wRPerm, wCPerm, d1 + 3, d2);
              var xValue =  getDy(batch, idyR, idyC, d2);
              let tmpval = vec4<f32>(dot(xValue, wValue0),
                                     dot(xValue, wValue1),
                                     dot(xValue, wValue2),
                                     dot(xValue, wValue3));
              dotProd[0] = dotProd[0] + tmpval;
              xValue = getDy(batch, idyR, idyC2, d2);
              dotProd[1] = dotProd[1] + vec4<f32>(dot(xValue, wValue0),
                                                  dot(xValue, wValue1),
                                                  dot(xValue, wValue2),
                                                  dot(xValue, wValue3));
            }
          } else if (bDyCVal) {
            let d2Length = uniforms.outBackprop[3];
            for (var d2 = 0; d2 < d2Length; d2 = d2 + 4) {
              let wValue0 = getW(wRPerm, wCPerm, d1, d2);
              let wValue1 = getW(wRPerm, wCPerm, d1 + 1, d2);
              let wValue2 = getW(wRPerm, wCPerm, d1 + 2, d2);
              let wValue3 = getW(wRPerm, wCPerm, d1 + 3, d2);
              var xValue =  getDy(batch, idyR, idyC, d2);
              let tmpval = vec4<f32>(dot(xValue, wValue0),
                                     dot(xValue, wValue1),
                                     dot(xValue, wValue2),
                                     dot(xValue, wValue3));
              dotProd[0] = dotProd[0] + tmpval;
            }
          } else if (bDyCVal2) {
            let d2Length = uniforms.outBackprop[3];
            for (var d2 = 0; d2 < d2Length; d2 = d2 + 4) {
              let wValue0 = getW(wRPerm, wCPerm, d1, d2);
              let wValue1 = getW(wRPerm, wCPerm, d1 + 1, d2);
              let wValue2 = getW(wRPerm, wCPerm, d1 + 2, d2);
              let wValue3 = getW(wRPerm, wCPerm, d1 + 3, d2);
              var xValue =  getDy(batch, idyR, idyC2, d2);
              let tmpval = vec4<f32>(dot(xValue, wValue0),
                                     dot(xValue, wValue1),
                                     dot(xValue, wValue2),
                                     dot(xValue, wValue3));
              dotProd[1] = dotProd[1] + tmpval;
            }
          }
        }
      }

      for (var i = 0; i < ${this.workPerThread}; i = i + 1) {
        let coords = vec4<i32>(batch, r, c + i, d1);
        if (coordsInBounds4D(coords, uniforms.outShape)) {
          setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], dotProd[i]);
        }
      }
    }
    `;return this.isVec4?`
    ${n}
    `:`
    ${D("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d1 = coords[${o}];

        let dyCorner = vec2<i32>(coords[${t}], coords[${e}]) - uniforms.pads;
        let dyRCorner = dyCorner.x;
        let dyCCorner = dyCorner.y;

        // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var wR = 0; wR < uniforms.filterDims.x; wR = wR + 1) {
          let dyR = (f32(dyRCorner) + f32(wR)) / f32(uniforms.strides.x);
          let wRPerm = uniforms.filterDims.x - 1 - wR;
          if (dyR < 0.0 || dyR >= f32(uniforms.outBackprop[1]) || fract(dyR) > 0.0 ||
              wRPerm < 0) {
            continue;
          }
          let idyR = i32(dyR);

          for (var wC = 0; wC < uniforms.filterDims.y; wC = wC + 1) {
            let dyC = (f32(dyCCorner) + f32(wC)) / f32(uniforms.strides.y);
            let wCPerm = uniforms.filterDims.y - 1 - wC;
            if (dyC < 0.0 || dyC >= f32(uniforms.outBackprop[2]) ||
                fract(dyC) > 0.0 || wCPerm < 0) {
              continue;
            }
            let idyC = i32(dyC);

            for (var d2 = 0; d2 < uniforms.outBackprop[3]; d2 = d2 + 1) {
              let xValue = ${this.isChannelsLast?"getDy(batch, idyR, idyC, d2)":"getDy(batch, d2, idyR, idyC)"};
              let wValue = getW(wRPerm, wCPerm, d1, d2);
              dotProd = dotProd + xValue * wValue;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}},gp=class{constructor(t){this.variableNames=["x","dy"],this.uniforms="pads : vec2<i32>, strides : vec2<i32>, batchSize : i32, outHeight : i32, outWidth : i32, inHeight : i32, inWidth : i32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.filterShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.isChannelsLast=t.dataFormat==="channelsLast",this.shaderKey=`conv2DDerFilter_${this.isChannelsLast}`}getUserCode(){return`
    ${D("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let wR = coords[0];
        let wC = coords[1];
        let d1 = coords[2];
        let d2 = coords[3];

        // Convolve x(?, ?, d1) with dy(:, :, d2) to get dw(wR, wC, d1, d2).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        for (var b = 0; b < uniforms.batchSize; b = b + 1) {
          for (var yR = 0; yR < uniforms.outHeight; yR = yR + 1) {
            let xR = wR + yR * uniforms.strides[0] - uniforms.pads[0];
            if (xR < 0 || xR >= uniforms.inHeight) {
              continue;
            }

            for (var yC = 0; yC < uniforms.outWidth; yC = yC + 1) {
              let xC = wC + yC * uniforms.strides[1] - uniforms.pads[1];

              if (xC < 0 || xC >= uniforms.inWidth) {
                continue;
              }

              if (${this.isChannelsLast}) {
                let dyValue = getDy(b, yR, yC, d2);
                let xValue = getX(b, xR, xC, d1);
                dotProd = dotProd + xValue * dyValue;
              } else {
                let dyValue = getDy(b, d2, yR, yC);
                let xValue = getX(b, d1, xR, xC);
                dotProd = dotProd + xValue * dyValue;
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}},xp=class{constructor(t){this.variableNames=["x","dy"],this.uniforms=`pads : vec3<i32>, strides : vec3<i32>, batchSize : i32, outDepth : i32,
       outHeight : i32, outWidth : i32, inDepth : i32, inHeight : i32, inWidth : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.filterShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="conv3DDerFilter"}getUserCode(){return`
    ${D("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let wF = coords.x;
        let wR = coords.y;
        let wC = coords.z;
        let d1 = coords.w;
        let d2 = coords.u;

        var dotProd = 0.0;
        for (var b = 0; b < uniforms.batchSize; b++) {
          for (var yF = 0; yF < uniforms.outDepth; yF++) {
            let xF = wF + yF * uniforms.strides[0] - uniforms.pads[0];
            if (xF < 0 || xF >= uniforms.inDepth) {
              continue;
            }

            for (var yR = 0; yR < uniforms.outHeight; yR++) {
              let xR = wR + yR * uniforms.strides[1] - uniforms.pads[1];
              if (xR < 0 || xR >= uniforms.inHeight) {
                continue;
              }

              for (var yC = 0; yC < uniforms.outWidth; yC++) {
                let xC = wC + yC * uniforms.strides[2] - uniforms.pads[2];
                if (xC < 0 || xC >= uniforms.inWidth) {
                  continue;
                }

                let dyValue = getDy(b, yF, yR, yC, d2);
                let xValue = getX(b, xF, xR, xC, d1);
                dotProd += xValue * dyValue;
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}},yp=class{constructor(t){this.variableNames=["dy","W"],this.uniforms=`filterDims : vec3<i32>, pads : vec3<i32>, strides : vec3<i32>,
      outDepth : i32, outHeight : i32, outWidth : i32, outChannels : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.inShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="conv3DDerInput"}getUserCode(){return`
    ${D("index")} {
      if(index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords.x;
        let d1 = coords.u;

        let dyCorner = vec3<i32>(coords.y, coords.z, coords.w) - uniforms.pads;
        let dyFCorner = dyCorner.x;
        let dyRCorner = dyCorner.y;
        let dyCCorner = dyCorner.z;

        var dotProd = 0.0;
        for (var wF = 0; wF < uniforms.filterDims[0]; wF++) {
          let dyF = f32(dyFCorner + wF) / f32(uniforms.strides[0]);
          if (dyF < 0.0 || dyF >= f32(uniforms.outDepth) || fract(dyF) > 0.0) {
            continue;
          }
          let idyF = i32(dyF);

          let wFPerm = uniforms.filterDims[0] - 1 - wF;

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[1]);

            if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
              continue;
            }
            let idyR = i32(dyR);

            let wRPerm = uniforms.filterDims[1] - 1 - wR;

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[2]);

              if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
                continue;
              }
              let idyC = i32(dyC);

              let wCPerm = uniforms.filterDims[2] - 1 - wC;

              for (var d2 = 0; d2 < uniforms.outChannels; d2++) {
                let xValue = getDy(batch, idyF, idyR, idyC, d2);
                let wValue = getW(wFPerm, wRPerm, wCPerm, d1, d2);
                dotProd += xValue * wValue;
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
  `}};function CA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,dy:s}=t,{strides:i,pad:a,dataFormat:u,dimRoundingMode:p,filterShape:l}=o,c=N.convertConv2DDataFormat(u),m=N.computeConv2DInfo(n.shape,l,i,1,a,p,!1,c),f=new gp(m),h=[{type:"int32",data:[m.padInfo.top,m.padInfo.left]},{type:"int32",data:[m.strideHeight,m.strideWidth]},{type:"int32",data:[m.batchSize]},{type:"int32",data:[m.outHeight]},{type:"int32",data:[m.outWidth]},{type:"int32",data:[m.inHeight]},{type:"int32",data:[m.inWidth]}];return e.runWebGPUProgram(f,[n,s],n.dtype,h)}var Fw={kernelName:Gi,backendName:"webgpu",kernelFunc:CA};function vA(r=4){let t=s=>{switch(s){case 1:return"return W[getIndexFromCoords4D(coord, uniforms.wShape)];";case 4:return`
            let coord1 = vec4<i32>(coordX, coordY, col + 1, rowInner);
            let coord2 = vec4<i32>(coordX, coordY, col + 2, rowInner);
            let coord3 = vec4<i32>(coordX, coordY, col + 3, rowInner);
            let v0 = W[getIndexFromCoords4D(coord, uniforms.wShape)];
            let v1 = W[getIndexFromCoords4D(coord1, uniforms.wShape)];
            let v2 = W[getIndexFromCoords4D(coord2, uniforms.wShape)];
            let v3 = W[getIndexFromCoords4D(coord3, uniforms.wShape)];
            return vec4<f32>(v0, v1, v2, v3);
            `;default:throw new Error(`innerElementSize ${s} is not supported.`)}},o=`if (row < uniforms.dimAOuter && col < uniforms.dimInner) {
        ${`
      let outRow = row / uniforms.outShape[2];
      let outCol = row % uniforms.outShape[2];

      let WRow = col / (uniforms.filterDims[1] * uniforms.outBackprop[3]);
      let WCol = col / uniforms.outBackprop[3] % uniforms.filterDims[1];
      let xR = f32(outRow - uniforms.pads[0] + WRow) / f32(uniforms.strides[0]);
      let xC = f32(outCol - uniforms.pads[1] + WCol) / f32(uniforms.strides[1]);
      if (xR < 0.0 || xR >= f32(uniforms.outBackprop[1]) || fract(xR) > 0.0) {
        return ${et(r)}(0.0);
      }
      if (xC < 0.0 || xC >= f32(uniforms.outBackprop[2]) || fract(xC) > 0.0) {
        return ${et(r)}(0.0);
      }
      let coord = vec4<i32>(
          batch,
          i32(xR),
          i32(xC),
          col % uniforms.outBackprop[3]);
      return x[getIndexFromCoords4D(coord, uniforms.xShape)/${r}];`}
      }
      return ${et(r)}(0.0);`;return`
  fn mm_readA(batch: i32, row : i32, col : i32) -> ${et(r)} {
    ${o}
  }

  fn mm_readB(batch: i32, row : i32, col : i32) -> ${et(r)} {
    let coordX = uniforms.filterDims.x - 1 -
        row / (uniforms.filterDims[1] * uniforms.outBackprop[3]);
    let coordY = uniforms.filterDims.y - 1 -
        (row / uniforms.outBackprop[3]) % uniforms.filterDims[1];
    if (row < uniforms.dimInner && col < uniforms.dimBOuter &&
        coordX >= 0 && coordY >= 0) {
      let rowInner = row % uniforms.outBackprop[3];
      let coord = vec4<i32>(coordX, coordY, col, rowInner);
      ${t(r)}
    }
    return ${et(r)}(0.0);
  }

  fn mm_write(batch: i32, row : i32, col : i32, valueInput : ${et(r)}) {
    if (row < uniforms.dimAOuter && col < uniforms.dimBOuter) {
      var value = valueInput;
      let outCoord = vec4<i32>(
          batch,
          row / uniforms.outShape[2],
          row % uniforms.outShape[2],
          col);
      result[getIndexFromCoords4D(outCoord, uniforms.outShape)/${r}] = value;
    }
  }`}var bp=class{constructor(t){this.variableNames=["x","W"],this.uniforms="filterDims : vec2<i32>, pads : vec2<i32>, strides : vec2<i32>, outBackprop : vec4<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32,",this.outputShape=t.inShape,S.assert(t.dataFormat==="channelsLast",()=>"TODO: NCHW is unimplemented"),this.isVec4=t.inChannels%4===0&&t.outChannels%4===0,this.dispatchLayout={x:[3],y:[1,2],z:[0]},this.workgroupSize=Bu(this.dispatchLayout,this.outputShape,this.isVec4),this.elementsPerThread=zu(this.dispatchLayout,this.outputShape,this.isVec4),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,this.elementsPerThread),this.isVec4&&(this.outputComponent=4,this.variableComponents=[4,1]),this.shaderKey=`conv2DDerInputMM_${this.isVec4}_${this.elementsPerThread}`}getUserCode(){let t=this.isVec4?Ao(this.elementsPerThread,this.workgroupSize):Ro(this.elementsPerThread,this.workgroupSize);return`
    ${vA(this.isVec4?4:1)}
    ${t}
    `}};function kA(r){let{inputs:t,backend:e,attrs:o}=r,{dy:n,filter:s}=t,{inputShape:i,strides:a,pad:u,dataFormat:p,dimRoundingMode:l}=o,c=N.convertConv2DDataFormat(p),m=N.computeConv2DInfo(i,s.shape,a,1,u,l,!1,c),f=[{type:"int32",data:[m.filterHeight,m.filterWidth]},{type:"int32",data:[m.filterHeight-1-m.padInfo.top,m.filterWidth-1-m.padInfo.left]},{type:"int32",data:[m.strideHeight,m.strideWidth]},{type:"int32",data:[m.batchSize,m.outHeight,m.outWidth,m.outChannels]}],h;if(L().getBool("WEBGPU_USE_NAIVE_CONV2D_TRANSPOSE")||m.dataFormat!=="channelsLast")h=new hp(m);else{h=new bp(m);let b=m.inHeight*m.inWidth,x=m.inChannels,C=m.filterHeight*m.filterWidth*m.outChannels;f.push({type:"uint32",data:[b]},{type:"uint32",data:[x]},{type:"uint32",data:[C]})}return e.runWebGPUProgram(h,[n,s],"float32",f)}var Pw={kernelName:en,backendName:"webgpu",kernelFunc:kA};var wp=class{constructor(t){this.variableNames=["x","W"],this.uniforms="filterDims: vec3<i32>, pads: vec3<i32>, strides: vec3<i32>, dilations: vec3<i32>,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.outShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="conv3dnaive"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let batch = coords.x;
        let d2 = coords.u;

        let xFRCCorner = vec3<i32>(coords.y, coords.z, coords.w) * uniforms.strides - uniforms.pads;
        let xFCorner = xFRCCorner.x;
        let xRCorner = xFRCCorner.y;
        let xCCorner = xFRCCorner.z;

        let inputDepthNearestVec4 = (uniforms.xShape.u / 4) * 4;
        let inputDepthVec4Remainder = uniforms.xShape.u % 4;

        var dotProd = 0.0;
        for (var wF = 0; wF < uniforms.filterDims[0]; wF++) {
          let xF = xFCorner + wF * uniforms.dilations[0];
          if (xF < 0 || xF >= uniforms.xShape.y) {
            continue;
          }

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let xR = xRCorner + wR * uniforms.dilations[1];
            if (xR < 0 || xR >= uniforms.xShape.z) {
              continue;
            }

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let xC = xCCorner + wC * uniforms.dilations[2];
              if (xC < 0 || xC >= uniforms.xShape.w) {
                continue;
              }

              for (var d1 = 0; d1 < inputDepthNearestVec4; d1 += 4) {
                let xValues = vec4<f32>(
                  getX(batch, xF, xR, xC, d1),
                  getX(batch, xF, xR, xC, d1 + 1),
                  getX(batch, xF, xR, xC, d1 + 2),
                  getX(batch, xF, xR, xC, d1 + 3)
                );
                let wValues = vec4<f32>(
                  getW(wF, wR, wC, d1, d2),
                  getW(wF, wR, wC, d1 + 1, d2),
                  getW(wF, wR, wC, d1 + 2, d2),
                  getW(wF, wR, wC, d1 + 3, d2)
                );

                dotProd += dot(xValues, wValues);
              }

              if (inputDepthVec4Remainder == 1) {
                dotProd += getX(batch, xF, xR, xC, inputDepthNearestVec4) *
                  getW(wF, wR, wC, inputDepthNearestVec4, d2);
              } else if (inputDepthVec4Remainder == 2) {
                let xValues = vec2<f32>(
                  getX(batch, xF, xR, xC, inputDepthNearestVec4),
                  getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1)
                );
                let wValues = vec2<f32>(
                  getW(wF, wR, wC, inputDepthNearestVec4, d2),
                  getW(wF, wR, wC, inputDepthNearestVec4 + 1, d2)
                );
                dotProd += dot(xValues, wValues);
              } else if (inputDepthVec4Remainder == 3) {
                let xValues = vec3<f32>(
                  getX(batch, xF, xR, xC, inputDepthNearestVec4),
                  getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                  getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2)
                );
                let wValues = vec3<f32>(
                  getW(wF, wR, wC, inputDepthNearestVec4, d2),
                  getW(wF, wR, wC, inputDepthNearestVec4 + 1, d2),
                  getW(wF, wR, wC, inputDepthNearestVec4 + 2, d2)
                );
                dotProd += dot(xValues, wValues);
              }
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }`}};function IA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,filter:s}=t,{strides:i,pad:a,dilations:u}=o,p=N.computeConv3DInfo(n.shape,s.shape,i,u,a),l=[p.padInfo.front,p.padInfo.top,p.padInfo.left],c=[{type:"int32",data:[p.filterDepth,p.filterHeight,p.filterWidth]},{type:"int32",data:[...l]},{type:"int32",data:[p.strideDepth,p.strideHeight,p.strideWidth]},{type:"int32",data:[p.dilationDepth,p.dilationHeight,p.dilationWidth]}],m=new wp(p),f=qt(n.dtype,s.dtype);return e.runWebGPUProgram(m,[n,s],f,c)}var Mw={kernelName:rn,backendName:"webgpu",kernelFunc:IA};function EA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,dy:s}=t,{strides:i,pad:a,filterShape:u}=o,p=N.computeConv3DInfo(n.shape,u,i,1,a),l=new xp(p),c=[{type:"int32",data:[p.padInfo.front,p.padInfo.top,p.padInfo.left]},{type:"int32",data:[p.strideDepth,p.strideHeight,p.strideWidth]},{type:"int32",data:[p.batchSize]},{type:"int32",data:[p.outDepth]},{type:"int32",data:[p.outHeight]},{type:"int32",data:[p.outWidth]},{type:"int32",data:[p.inDepth]},{type:"int32",data:[p.inHeight]},{type:"int32",data:[p.inWidth]}];return e.runWebGPUProgram(l,[n,s],s.dtype,c)}var _w={kernelName:Oi,backendName:"webgpu",kernelFunc:EA};function $A(r){let{inputs:t,backend:e,attrs:o}=r,{dy:n,filter:s}=t,{strides:i,pad:a,inputShape:u}=o,p=N.computeConv3DInfo(u,s.shape,i,1,a),l=new yp(p),c=[{type:"int32",data:[p.filterDepth,p.filterHeight,p.filterWidth]},{type:"int32",data:[p.filterDepth-1-p.padInfo.front,p.filterHeight-1-p.padInfo.top,p.filterWidth-1-p.padInfo.left]},{type:"int32",data:[p.strideDepth,p.strideHeight,p.strideWidth]},{type:"int32",data:[p.outDepth]},{type:"int32",data:[p.outHeight]},{type:"int32",data:[p.outWidth]},{type:"int32",data:[p.outChannels]}];return e.runWebGPUProgram(l,[n,s],n.dtype,c)}var Bw={kernelName:Wi,backendName:"webgpu",kernelFunc:$A};var NA=j({opType:P.COS}),zw={kernelName:"Cos",backendName:"webgpu",kernelFunc:NA};var TA=j({opType:P.COSH}),Lw={kernelName:on,backendName:"webgpu",kernelFunc:TA};var Sp=class{constructor(t,e,o,n){this.variableNames=["Image","Boxes","BoxInd"],this.uniforms="extrapolationValue : f32,",this.workgroupSize=[64,1,1],this.size=!0;let[s]=e;this.outputShape=[s,o[0],o[1],t],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.methodId=n==="bilinear"?1:0,this.cropHeightBiggerThan1=this.outputShape[1]>1,this.cropWidthBiggerThan1=this.outputShape[2]>1,this.shaderKey=`cropAndResize_${this.methodId}_${this.cropHeightBiggerThan1}_${this.cropWidthBiggerThan1}`}getUserCode(){let[t,e]=["f32(uniforms.imageShape[1] - 1)","f32(uniforms.imageShape[2] - 1)"],[o,n,s]=this.cropHeightBiggerThan1?[`(${t} / f32(uniforms.outShape[1] - 1))`,"(y2-y1) * height_ratio",`y1*${t} + f32(y)*(height_scale)`]:["0.0","0.0",`0.5 * (y1+y2) * ${t}`],[i,a,u]=this.cropWidthBiggerThan1?[`(${e} / f32(uniforms.outShape[2] - 1))`,"(x2-x1) * width_ratio",`x1*${e} + f32(x)*(width_scale)`]:["0.0","0.0",`0.5 * (x1+x2) * ${e}`];return`
    ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let height_ratio = f32(${o});
        let width_ratio = f32(${i});
        let b = coords[0];
        let y = coords[1];
        let x = coords[2];
        let d = coords[3];
        // get box vals
        let y1 = getBoxes(b, 0);
        let x1 = getBoxes(b, 1);
        let y2 = getBoxes(b, 2);
        let x2 = getBoxes(b, 3);
        // get image in batch index
        let bInd = i32(round(getBoxInd(b)));
        if(bInd < 0 || bInd >= uniforms.outShape[0]) {
          return;
        }
        let height_scale = ${n};
        let width_scale = ${a};
        let in_y = ${s};
        if( in_y < 0.0 || in_y > ${t} ) {
          setOutputAtIndex(index, uniforms.extrapolationValue);
          return;
        }
        let in_x = ${u};
        if( in_x < 0.0 || in_x > ${e} ) {
          setOutputAtIndex(index, uniforms.extrapolationValue);
          return;
        }
        let sourceFracIndexCR = vec2<f32>(in_x,in_y);
        if(${this.methodId} == 1) {
          // Compute the four integer indices.
          let sourceFloorCR = vec2<i32>(sourceFracIndexCR);
          let sourceCeilCR = vec2<i32>(ceil(sourceFracIndexCR));
          let topLeft = getImage(bInd, sourceFloorCR.y, sourceFloorCR.x, d);
          let bottomLeft = getImage(bInd, sourceCeilCR.y, sourceFloorCR.x, d);
          let topRight = getImage(bInd, sourceFloorCR.y, sourceCeilCR.x, d);
          let bottomRight = getImage(bInd, sourceCeilCR.y, sourceCeilCR.x, d);
          let fracCR = sourceFracIndexCR - vec2<f32>(sourceFloorCR);
          let top = topLeft + (topRight - topLeft) * fracCR.x;
          let bottom = bottomLeft + (bottomRight - bottomLeft) * fracCR.x;
          let newValue = top + (bottom - top) * fracCR.y;
          setOutputAtIndex(index, newValue);
        } else {
          // Compute the coordinators of nearest neighbor point.
          let sourceNearestCR = vec2<i32>(floor(
            sourceFracIndexCR + vec2<f32>(0.5,0.5)));
          let newValue = getImage(
            bInd, sourceNearestCR.y, sourceNearestCR.x, d);
          setOutputAtIndex(index, newValue);
        }
      }
    }
    `}};var DA=r=>{let{inputs:t,backend:e,attrs:o}=r,{image:n,boxes:s,boxInd:i}=t,{cropSize:a,method:u,extrapolationValue:p}=o,l=new Sp(n.shape[3],s.shape,a,u),c=[{type:"float32",data:[p]}];return e.runWebGPUProgram(l,[n,s,i],"float32",c)},Gw={kernelName:Hi,backendName:"webgpu",kernelFunc:DA};var Mo;(function(r){r.Prod="*",r.Sum="+"})(Mo||(Mo={}));var Di=class{constructor(t,e,o,n){this.variableNames=["x"],this.uniforms="index : f32,",this.size=!0,this.workgroupSize=[128,1,1],this.outputShape=e,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.exclusive=o,this.reverse=n,this.op=t,this.shaderKey=`cum_${this.op}_${this.exclusive}_${this.reverse}`}getUserCode(){let t=this.outputShape.length,e=this.op===Mo.Prod?"1.0":"0.0",o=this.exclusive?e:`getX(${Ow(t,"coords",this.op)})`,n=this.outputShape[this.outputShape.length-1],s="",i="";return this.exclusive?(s=this.reverse?`end != ${n-1}`:"end != 0",i=this.reverse?"end + 1":"end - 1"):(s=this.reverse?`end + pow2 < ${n}`:"end >= pow2",i=this.reverse?"end + pow2":"end - pow2"),`
      ${D("index")} {
       if (index < uniforms.size) {
         var coords = getCoordsFromIndex(index);

         let end = ${Ww(t,"coords",this.op)};
         var val = ${o};
         let pow2 = i32(pow(2.0, uniforms.index));
         if (${s}) {
           let idx = ${i};
           ${Ww(t,"coords",this.op)} = idx;
           val ${this.op}= getX(${Ow(t,"coords",this.op)});
         }
         setOutputAtIndex(index, val);
       }
      }
    `}};function Ow(r,t,e){if(r===1)return`${t}`;if(r===2)return`${t}.x, ${t}.y`;if(r===3)return`${t}.x, ${t}.y, ${t}.z`;if(r===4)return`${t}.x, ${t}.y, ${t}.z, ${t}.w`;throw Error(`Cumulative ${e} for rank ${r} is not yet supported`)}function Ww(r,t,e){if(r===1)return`${t}`;if(r===2)return`${t}.y`;if(r===3)return`${t}.z`;if(r===4)return`${t}.w`;throw Error(`Cumulative ${e} for rank ${r} is not yet supported`)}function Cp(r,t,e,o,n,s){let i=t.shape.length,a=N.getAxesPermutation([o],i),u=t;a!=null&&(u=Kt({inputs:{x:t},backend:e,attrs:{perm:a}}));let p=N.getInnerMostAxes(1,i)[0];if(p!==i-1)throw new Error(`WebGPU cumprod shader expects an inner-most axis=${t.shape.length-1} but got axis=${o}`);let l=u.shape[p],c=Nt({inputs:{x:u},backend:e});for(let m=0;m<=Math.ceil(Math.log2(l))-1;m++){let f=new Di(r,u.shape,!1,s),h=c,b=[{type:"float32",data:[m]}];c=e.runWebGPUProgram(f,[c],c.dtype,b),e.disposeData(h.dataId)}if(n){let m=new Di(r,u.shape,n,s),f=c,h=[{type:"float32",data:[0]}];c=e.runWebGPUProgram(m,[c],c.dtype,h),e.disposeData(f.dataId)}if(a!=null){let m=N.getUndoAxesPermutation(a),f=Kt({inputs:{x:c},backend:e,attrs:{perm:m}});return e.disposeData(c.dataId),e.disposeData(u.dataId),f}return c}function AA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{axis:s,exclusive:i,reverse:a}=o;return Cp(Mo.Prod,n,e,s,i,a)}var Uw={kernelName:Vi,backendName:"webgpu",kernelFunc:AA};function RA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{axis:s,exclusive:i,reverse:a}=o;return Cp(Mo.Sum,n,e,s,i,a)}var Vw={kernelName:nn,backendName:"webgpu",kernelFunc:RA};function FA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,weights:s}=t,{size:i,binaryOutput:a}=o,u=n.shape.length===1,l=S.sizeFromShape(s.shape)>0,c=s.dtype,m=u?[n.shape[0]]:[n.shape[0],n.shape[1]],f=u?[i]:[n.shape[0],i],h=Ct({backend:e,attrs:{shape:f,value:0,dtype:c}}),b=new As(m,l,a),x=[{type:"int32",data:[i]}],C=l?[n,s]:[n];return e.runWebGPUProgram(b,C,c,x,h)}var Hw={kernelName:qi,backendName:"webgpu",kernelFunc:FA};var vp=class{constructor(t,e){this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.uniforms="blockSize : i32,",this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey=`depthToSpace_${e}`,this.dataFormat=e}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let b = coords[0];
          let h = ${this.getHeightCoordString()};
          let w = ${this.getWidthCoordString()};
          let d = ${this.getDepthCoordString()};

          let in_h = h / uniforms.blockSize;
          let offset_h = h % uniforms.blockSize;
          let in_w = w / uniforms.blockSize;
          let offset_w = w % uniforms.blockSize;
          let offset_d = (offset_h * uniforms.blockSize + offset_w) *
            ${this.getOutputDepthSize()};
          let in_d = d + offset_d;

          let rlt = ${this.getInputSamplingString()};
          setOutputAtIndex(index, rlt);
        }
      }`}getHeightCoordString(){return this.dataFormat==="NHWC"?"coords[1]":"coords[2]"}getWidthCoordString(){return this.dataFormat==="NHWC"?"coords[2]":"coords[3]"}getDepthCoordString(){return this.dataFormat==="NHWC"?"coords[3]":"coords[1]"}getOutputDepthSize(){return this.dataFormat==="NHWC"?"uniforms.outShape[3]":"uniforms.outShape[1]"}getInputSamplingString(){return this.dataFormat==="NHWC"?"getX(b, in_h, in_w, in_d)":"getX(b, in_d, in_h, in_w)"}};function PA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{blockSize:s,dataFormat:i}=o,a=n.shape[0],u=i==="NHWC"?n.shape[1]:n.shape[2],p=i==="NHWC"?n.shape[2]:n.shape[3],l=i==="NHWC"?n.shape[3]:n.shape[1],c=u*s,m=p*s,f=l/(s*s),h=i==="NHWC"?[a,c,m,f]:[a,f,c,m],b=[{type:"int32",data:[s]}],x=new vp(h,i);return e.runWebGPUProgram(x,[n],n.dtype,b)}var qw={kernelName:Ki,backendName:"webgpu",kernelFunc:PA};var kp=class{constructor(t,e,o,n=!1,s=null,i=!1){this.variableNames=["x","W"],this.uniforms="pads : vec2<i32>, inDims : vec2<i32>,",this.workgroupSize=[16,16,1],this.outputShape=t,this.dispatchLayout={x:[3],y:[2],z:[0,1]},this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),n&&this.variableNames.push("bias"),i&&this.variableNames.push("preluActivationWeights"),this.addBias=n,this.activation=s,this.hasPreluActivation=i,this.filterHeight=e,this.filterWidth=o,this.shaderKey=`depthwiseNCHW_${this.activation}_${this.filterHeight}_${this.filterWidth}`}getUserCode(){let t=this.filterWidth*this.filterHeight,e=this.workgroupSize[0]*this.workgroupSize[1]*this.workgroupSize[2],o=this.workgroupSize[1]+this.filterHeight-1,n=this.workgroupSize[0]+this.filterWidth-1;return`
      ${Vt(this.activation,this.hasPreluActivation,!1,4)}

      var<workgroup> mm_Asub : array<array<f32, ${n}>, ${o}>;
      var<workgroup> mm_Bsub : array<array<f32, ${this.filterWidth}>, ${this.filterHeight}>;
      fn readX(batch : i32, channel : i32, row : i32, col : i32) -> f32 {
        var value = 0.0;
        if (row >=0 && row < uniforms.inDims[0] && col >=0 && col < uniforms.inDims[1])
        {
          value = getX(batch, channel, row, col);
        }
        return value;
      }

      ${D()} {
        let coords = getOutputCoords();
        let batch = coords[0];
        let xRCCorner = vec2<i32>(coords.zw) - uniforms.pads;
        let channelMul = uniforms.wShape[3];
        let d1 = coords[1] / channelMul;
        let q = coords[1] % channelMul;

        let inputRowStart = xRCCorner.x;
        let inputColStart = xRCCorner.y;

        let localRow = i32(localId.y);
        let localCol = i32(localId.x);

        // Load one tile of X into local memory.
        for (var inputRow = localRow; inputRow < ${o}; inputRow = inputRow + ${this.workgroupSize[1]}) {
          for (var inputCol = localCol; inputCol < ${n}; inputCol = inputCol + ${this.workgroupSize[0]}) {
            let rowOffset = inputRow - localRow;
            let colOffset = inputCol - localCol;
            mm_Asub[inputRow][inputCol] = readX(batch, d1, inputRowStart + rowOffset, inputColStart + colOffset);
          }
        }

        // Load one tile of W into local memory.
        var wIndex = i32(localIndex);
        ${t<e?`if (wIndex < ${t})`:`for(; wIndex < ${t}; wIndex = wIndex + ${e})`}

        {
          let wRow = wIndex / ${this.filterWidth};
          let wCol = wIndex % ${this.filterWidth};
          mm_Bsub[wRow][wCol] = getW(wRow, wCol, d1, q);
        }

        workgroupBarrier();

        var value = 0.0;
        for (var wR = 0; wR < ${this.filterHeight}; wR = wR + 1) {
          for (var wC = 0; wC < ${this.filterWidth}; wC = wC + 1) {
            let xVal = mm_Asub[localRow + wR][localCol + wC];
            let wVal = mm_Bsub[wR][wC];
            value = fma(xVal, wVal, value);
          }
        }
        ${le(this.addBias,this.activation)}
        if (coordsInBounds4D(coords, uniforms.outShape)) {
          setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
        }
      }
    `}};var Fs=class{constructor(t,e=!1,o=null,n=!1){this.variableNames=["x","W"],this.uniforms="pads : vec2<i32>, inDims : vec2<i32>, virtualWidth : i32,",this.workgroupSize=[64,1,1],this.workPerThread=4,this.outputComponent=4,this.outputShape=t.outShape,this.virtualWidth=Math.ceil(this.outputShape[2]/this.workPerThread)*this.workPerThread;let s=[this.outputShape[0],this.outputShape[1],this.virtualWidth,this.outputShape[3]];this.dispatchLayout=F(s),this.dispatch=A(this.dispatchLayout,s,this.workgroupSize,[this.outputComponent*this.workPerThread,1,1]),S.assert(t.dataFormat==="channelsLast",()=>"TODO: NCHW is unimplemented"),e&&this.variableNames.push("bias"),n&&this.variableNames.push("preluActivationWeights"),this.convInfo=t,this.addBias=e,this.activation=o,this.hasPreluActivation=n,this.shaderKey=`depthwiseVec4_${o}_${this.convInfo.filterHeight}_${this.convInfo.filterWidth}_${this.convInfo.strideHeight}_${this.convInfo.strideWidth}_${this.workPerThread}`}getUserCode(){let t=(this.workPerThread-1)*this.convInfo.strideWidth+this.convInfo.filterWidth,e=this.convInfo.strideHeight,o=this.convInfo.strideWidth;return`
      ${Vt(this.activation,this.hasPreluActivation,!0,4)}
      fn readX(batch : i32, row : i32, col : i32, channel : i32) -> vec4<f32> {
        var value = vec4<f32>(0.0);
        if (col >=0 && col < uniforms.inDims[1]) {
          value = getX(batch, row, col, channel);
        }
        return value;
      }

      ${D("index")} {
        let width0 = uniforms.outShape[3] / ${this.outputComponent};
        let d1 = (index % width0) * ${this.outputComponent};
        var index1 = index / width0;
        let width1 = uniforms.virtualWidth / ${this.workPerThread};
        let c = (index1 % width1) * ${this.workPerThread};
        index1 = index1 / width1;
        let r = index1 % uniforms.outShape[1];
        let batch = index1 / uniforms.outShape[1];

        let xRCCorner = vec2<i32>(r, c) * vec2<i32>(${e}, ${o}) - uniforms.pads;

        let xRCorner = xRCCorner.x;
        let xCCorner = xRCCorner.y;
        var xVals : array<vec4<f32>, ${t}>;
        var dotProd : array<vec4<f32>, ${this.workPerThread}>;
        for (var i = 0; i < ${this.workPerThread}; i++) {
          dotProd[i] = vec4<f32>(0.0);
        }

        // Use constant instead of uniform can give better performance.
        for (var wR = 0; wR < ${this.convInfo.filterHeight}; wR = wR + 1) {
          let xR = xRCorner + wR;
          if (xR >=0 && xR < uniforms.inDims[0]) {
            for (var i = 0; i < ${t}; i++) {
              xVals[i] = readX(batch, xR, xCCorner + i, d1);
            }
            for (var wC = 0; wC < ${this.convInfo.filterWidth}; wC = wC + 1) {
              let wValue = getW(wR, wC, d1, 0);
              for (var i = 0; i < ${this.workPerThread}; i++) {
                dotProd[i] = fma(xVals[i * ${o} + wC], wValue, dotProd[i]);
              }
            }
          }
        }

        for (var i = 0; i < ${this.workPerThread}; i = i + 1) {
          let coords = vec4<i32>(batch, r, c + i, d1);
          if (coordsInBounds4D(coords, uniforms.outShape)) {
            var value = dotProd[i];
            ${le(this.addBias,this.activation)}
            setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
          }
        }
      }
    `}};var Ps=class{constructor(t,e=!1,o=null,n=!1){this.variableNames=["x","W"],this.uniforms=`pads : vec2<i32>, inDims : vec2<i32>, filterHeight : i32,
      filterWidth : i32, strides : vec2<i32>, dilations : vec2<i32>,`,this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=t.outShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.isChannelsLast=t.dataFormat==="channelsLast",e&&this.variableNames.push("bias"),n&&this.variableNames.push("preluActivationWeights"),this.convInfo=t,this.addBias=e,this.activation=o,this.hasPreluActivation=n,this.shaderKey=`depthwise_${this.activation}_${this.isChannelsLast}`}getUserCode(){let t=this.isChannelsLast?"getX(batch, xR, xC, d1);":"getX(batch, d1, xR, xC);";return`
      ${Vt(this.activation,this.hasPreluActivation,!1,4)}

      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let batch = coords[0];
          let xRCCorner = vec2<i32>(coords.${this.isChannelsLast?"yz":"zw"}) * uniforms.strides - uniforms.pads;
          let d2 = coords[${this.isChannelsLast?3:1}];
          let channelMul = uniforms.wShape[3];
          let d1 = d2 / channelMul;
          let q = d2 % channelMul;

          let inputRowStart = xRCCorner.x;
          let inputColStart = xRCCorner.y;
          let inputRowEnd = inputRowStart + uniforms.filterHeight *
              uniforms.dilations[0];
          let inputColEnd = inputColStart + uniforms.filterWidth *
              uniforms.dilations[1];

          // Convolve x(?, ?, d1)|x(d1, ?, ?) with w(:, :, d1, q) to get
          // y(yR, yC, d2)|y(d2, yR, yC). ? = to be determined. : = across all
          // values in that axis. x(?, ?, d1) and y(yR, yC, d2) is for NHWC.
          // x(d1, ?, ?) and y(d2, yR, yC) is for NCHW.
          var value = 0.0;

          // Extract if checking out of for loop for performance.
          if (inputRowStart >= 0 && inputColStart >= 0 &&
            inputRowEnd < uniforms.inDims[0] &&
                inputColEnd < uniforms.inDims[1]) {
              for (var wR = 0; wR < uniforms.filterHeight; wR = wR + 1) {
                let xR = inputRowStart + wR * uniforms.dilations[0];

                for (var wC = 0; wC < uniforms.filterWidth; wC = wC + 1) {
                  let xC = inputColStart + wC * uniforms.dilations[1];

                  let xVal = ${t};
                  let wVal = getW(wR, wC, d1, q);
                  value = value + xVal * wVal;
                }
              }
            } else {
              for (var wR = 0; wR < uniforms.filterHeight; wR = wR + 1) {
                let xR = inputRowStart + wR * uniforms.dilations[0];

                if (xR < 0 || xR >= uniforms.inDims[0]) {
                  continue;
                }

                for (var wC = 0; wC < uniforms.filterWidth; wC = wC + 1) {
                  let xC = inputColStart + wC * uniforms.dilations[1];

                  if (xC < 0 || xC >= uniforms.inDims[1]) {
                    continue;
                  }

                  let xVal = ${t};
                  let wVal = getW(wR, wC, d1, q);
                  value = value + xVal * wVal;
                }
              }
            }
            ${le(this.addBias,this.activation)}
          setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
        }
      }
    `}};function MA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,filter:s}=t,{strides:i,pad:a,dataFormat:u,dilations:p,dimRoundingMode:l}=o,c=N.convertConv2DDataFormat(u),m=p;m==null&&(m=[1,1]);let f=N.computeConv2DInfo(n.shape,s.shape,i,m,a,l,!0,c),h=[{type:"int32",data:[f.padInfo.top,f.padInfo.left]},{type:"int32",data:[f.inHeight,f.inWidth]}],b=f.dataFormat==="channelsLast",x;return!b&&f.inHeight>16&&f.inWidth>16&&f.strideHeight===1&&f.strideWidth===1&&f.dilationWidth===1&&f.dilationHeight===1&&f.inChannels===f.outChannels?x=new kp(f.outShape,f.filterHeight,f.filterWidth):b&&f.outHeight>4&&f.outWidth>4&&f.strideWidth<=2&&f.inChannels===f.outChannels&&f.dilationHeight===1&&f.dilationWidth===1&&f.inChannels%4===0?(x=new Fs(f),h.push({type:"int32",data:[x.virtualWidth]})):(x=new Ps(f),h.push({type:"int32",data:[f.filterHeight]},{type:"int32",data:[f.filterWidth]},{type:"int32",data:[f.strideHeight,f.strideWidth]},{type:"int32",data:[f.dilationHeight,f.dilationWidth]})),e.runWebGPUProgram(x,[n,s],n.dtype,h)}var Kw={kernelName:sn,backendName:"webgpu",kernelFunc:MA};var Ip=class{constructor(t){this.variableNames=["x","dy"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, filterDims : vec2<i32>, outHeight : i32,
      outWidth : i32, inHeight : i32, inWidth : i32, batchSize : i32, channelMul : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.filterShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="depthwise_conv2d_backprop_filter"}getUserCode(){return`
      ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let wR = coords[0];
        let wC = coords[1];
        let d1 = coords[2];
        let dm = coords[3];
        let d2 = d1 * uniforms.channelMul + dm;

        var dotProd = 0.0;
        for (var b = 0; b < uniforms.batchSize; b++) {
          for (var yR = 0; yR < uniforms.outHeight; yR++) {
            let xR = wR + yR * uniforms.strides[0] - uniforms.pads[0];

            if (xR < 0 || xR >= uniforms.inHeight) {
              continue;
            }

            for (var yC = 0; yC < uniforms.outWidth; yC++) {
              let xC = wC + yC * uniforms.strides[1] - uniforms.pads[1];

              if (xC < 0 || xC >= uniforms.inWidth) {
                continue;
              }

              let dyValue = getDy(b, yR, yC, d2);
              let xValue = getX(b, xR, xC, d1);
              dotProd += xValue * dyValue;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}},Ep=class{constructor(t){this.variableNames=["dy","W"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, filterDims : vec2<i32>,
       outHeight : i32, outWidth : i32, channelMul : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.inShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="depthwise_conv2d_backprop_input"}getUserCode(){return`
      ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d1 = coords[3];
        let dyCorner = coords.yz - uniforms.pads;
        let dyRCorner = dyCorner.x;
        let dyCCorner = dyCorner.y;

        var dotProd = 0.0;
        for (var wR = 0; wR < uniforms.filterDims[0]; wR++) {
          let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[0]);

          if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
            continue;
          }

          let idyR = i32(dyR);
          let wRPerm = uniforms.filterDims[0] - 1 - wR;

          for (var wC = 0; wC < uniforms.filterDims[1]; wC++) {
            let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[1]);

            if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
              continue;
            }

            let idyC = i32(dyC);
            let wCPerm = uniforms.filterDims[1] - 1 - wC;

            for (var dm = 0; dm < uniforms.channelMul; dm++) {
              let d2 = d1 * uniforms.channelMul + dm;
              let xValue = getDy(batch, idyR, idyC, d2);
              let wValue = getW(wRPerm, wCPerm, d1, dm);
              dotProd += xValue * wValue;
            }
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}};function _A(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,dy:s}=t,{strides:i,dilations:a,pad:u,dimRoundingMode:p,filterShape:l}=o,c=N.computeConv2DInfo(n.shape,l,i,a,u,p,!0),m=new Ip(c),f=[{type:"int32",data:[c.strideHeight,c.strideWidth]},{type:"int32",data:[c.padInfo.top,c.padInfo.left]},{type:"int32",data:[c.filterHeight,c.filterWidth]},{type:"int32",data:[c.outHeight]},{type:"int32",data:[c.outWidth]},{type:"int32",data:[c.inHeight]},{type:"int32",data:[c.inWidth]},{type:"int32",data:[c.batchSize]},{type:"int32",data:[c.outChannels/c.inChannels]}];return e.runWebGPUProgram(m,[n,s],"float32",f)}var Xw={kernelName:Xi,backendName:"webgpu",kernelFunc:_A};function BA(r){let{inputs:t,backend:e,attrs:o}=r,{dy:n,filter:s}=t,{strides:i,dilations:a,pad:u,dimRoundingMode:p,inputShape:l}=o,c=N.computeConv2DInfo(l,s.shape,i,a,u,p,!0),m=new Ep(c),f=[{type:"int32",data:[c.strideHeight,c.strideWidth]},{type:"int32",data:[c.filterHeight-1-c.padInfo.top,c.filterWidth-1-c.padInfo.left]},{type:"int32",data:[c.filterHeight,c.filterWidth]},{type:"int32",data:[c.outHeight]},{type:"int32",data:[c.outWidth]},{type:"int32",data:[c.outChannels/c.inChannels]}];return e.runWebGPUProgram(m,[n,s],n.dtype,f)}var jw={kernelName:ji,backendName:"webgpu",kernelFunc:BA};var $p=class{constructor(t){this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[t,t],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="diag"}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let value = select(0.0, getX(coords[0]), coords[0] == coords[1]);
          setOutputAtIndex(index, value);
        }
      }
    `}};function zA(r){let{inputs:t,backend:e}=r,{x:o}=t,n=[...o.shape,...o.shape],s=S.sizeFromShape(o.shape),i=G({inputs:{x:o},backend:e,attrs:{shape:[s]}}),a=new $p(s),u=e.runWebGPUProgram(a,[i],i.dtype),p=G({inputs:{x:u},backend:e,attrs:{shape:n}});return e.disposeData(i.dataId),e.disposeData(u.dataId),p}var Yw={kernelName:Yi,backendName:"webgpu",kernelFunc:zA};var Np=class{constructor(t){this.variableNames=["x","w"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.outShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="dilation2d"}getUserCode(){return`
       ${D("index")} {
         if (index < uniforms.size) {
           let neg_infinity = -3.4e38;
           let coords = getOutputCoords();
           let batch = coords.x;
           let d1 = coords.w;
           let outTopLeftCorner = coords.yz * uniforms.strides - uniforms.pads;
           let hBeg = outTopLeftCorner.x;
           let wBeg = outTopLeftCorner.y;

           var curVal = neg_infinity;
           for (var h = 0; h < uniforms.filterDims[0]; h = h + 1) {
             let hIn = hBeg + h * uniforms.dilations[0];

             if (hIn >= 0 && hIn < uniforms.xShape[1]) {
               for (var w = 0; w < uniforms.filterDims[1]; w = w + 1) {
                 let wIn = wBeg + w * uniforms.dilations[1];

                 if (wIn >= 0 && wIn < uniforms.xShape[2]) {
                   let val = getX(batch, hIn, wIn, d1) + getW(h, w, d1);
                   if (val > curVal) {
                     curVal = val;
                   }
                 }
               }
             }
           }

           setOutputAtIndex(index, curVal);
         }
       }
     `}};function LA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,filter:s}=t,{strides:i,pad:a,dilations:u}=o,p=N.computeDilation2DInfo(n.shape,s.shape,i,a,"NHWC",u),l=[p.padInfo.top,p.padInfo.left],c=[{type:"int32",data:[p.filterHeight,p.filterWidth]},{type:"int32",data:[...l]},{type:"int32",data:[p.strideHeight,p.strideWidth]},{type:"int32",data:[p.dilationHeight,p.dilationWidth]}],m=new Np(p);return e.runWebGPUProgram(m,[n,s],n.dtype,c)}var Zw={kernelName:an,backendName:"webgpu",kernelFunc:LA};var Tp=class{constructor(t,e){if(this.variableNames=["x","w","dy"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>, dySize: i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=t.inShape,this.dispatchLayout=F(t.outShape),this.dispatch=A(this.dispatchLayout,t.outShape,this.workgroupSize),e!=="float32"&&e!=="int32")throw new Error(`Dilation2DBackpropInput only supports float32 and int32
          types, does not support ${e} type.`);this.type=e,this.shaderKey="dilation2DBackpropInput"}getUserCode(){return`
       ${D("index")} {
         if (index < uniforms.dySize) {
           let coords = getDyCoordsFromIndex(index);
           let b = coords[0];
           let r = coords[1];
           let c = coords[2];
           let d = coords[3];

           let dyCorner = vec2<i32>(r, c) * uniforms.strides - uniforms.pads;
           var curVal = -3.4e38;  // neg_infinity
           var xRMax = 0;
           var xCMax = 0;

           // In the case of multiple argmax branches, we only back-propagate
           // along the last branch, i.e., the one with largest value of
           // 'wR * uniforms.filterDims[1] + wC', similarly to the max-pooling
           // backward routines.
           for (var wR = 0; wR < uniforms.filterDims[0]; wR++) {
             let xR = dyCorner.x + wR * uniforms.dilations[0];

             if (xR >= 0 && xR < uniforms.xShape[1]) {
               for (var wC = 0; wC < uniforms.filterDims[1]; wC++) {
                 let xC = dyCorner.y + wC * uniforms.dilations[1];

                 if (xC >= 0 && xC < uniforms.xShape[2]) {
                   let val = getX(b, xR, xC, d) + getW(wR, wC, d);
                   if (val > curVal) {
                     curVal = val;
                     xRMax = xR;
                     xCMax = xC;
                   }
                 }
               }
             }
           }

           let flatIndexIn = d + uniforms.xShape[3] *
               (xCMax + uniforms.xShape[2] * (xRMax + uniforms.xShape[1] * b));
           let value = getDy(b, r, c, d);
           ${pe("&result[flatIndexIn]","value",this.type)}
         }
       }
     `}},Dp=class{constructor(t,e,o){if(this.variableNames=["x","w","dy"],this.uniforms="filterDims: vec2<i32>, pads: vec2<i32>, strides: vec2<i32>, dilations: vec2<i32>, dySize: i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=t.filterShape,this.dispatchLayout=F(t.outShape),this.dispatch=A(this.dispatchLayout,t.outShape,this.workgroupSize),o!=="float32"&&o!=="int32")throw new Error(`Dilation2DBackpropFilter only supports float32 and int32
          types, does not support ${o} type.`);this.type=o,this.shaderKey="dilation2DBackpropFilter"}getUserCode(){return`
       ${D("index")} {
         if (index < uniforms.dySize) {
           let coords = getDyCoordsFromIndex(index);
           let b = coords[0];
           let r = coords[1];
           let c = coords[2];
           let d = coords[3];

           let dyCorner = vec2<i32>(r, c) * uniforms.strides - uniforms.pads;
           var curVal = -3.4e38;  // neg_infinity
           var wRMax = 0;
           var wCMax = 0;

           // In the case of multiple argmax branches, we only back-propagate
           // along the last branch, i.e., the one with largest value of
           // 'wR * uniforms.filterDims[1] + wC', similarly to the max-pooling
           // backward routines.
           for (var wR = 0; wR < uniforms.filterDims[0]; wR++) {
             let xR = dyCorner.x + wR * uniforms.dilations[0];

             if (xR >= 0 && xR < uniforms.xShape[1]) {
               for (var wC = 0; wC < uniforms.filterDims[1]; wC++) {
                 let xC = dyCorner.y + wC * uniforms.dilations[1];

                 if (xC >= 0 && xC < uniforms.xShape[2]) {
                   let val = getX(b, xR, xC, d) + getW(wR, wC, d);
                   if (val > curVal) {
                     curVal = val;
                     wRMax = wR;
                     wCMax = wC;
                   }
                 }
               }
             }
           }

           let flatIndexIn = d + uniforms.wShape[2] * (wCMax + wRMax * uniforms.wShape[1]);
           let value = getDy(b, r, c, d);
           ${pe("&result[flatIndexIn]","value",this.type)}
         }
       }
     `}};function GA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,filter:s,dy:i}=t,{strides:a,pad:u,dilations:p}=o,l=N.computeDilation2DInfo(n.shape,s.shape,a,u,"NHWC",p),c=s.dtype,m=new Dp(l,s.shape,c),f=[{type:"int32",data:[l.filterHeight,l.filterWidth]},{type:"int32",data:[l.padInfo.top,l.padInfo.left]},{type:"int32",data:[l.strideHeight,l.strideWidth]},{type:"int32",data:[l.dilationHeight,l.dilationWidth]},{type:"int32",data:[S.sizeFromShape(l.outShape)]}],h=Ct({backend:e,attrs:{shape:s.shape,value:0,dtype:c}});return e.runWebGPUProgram(m,[n,s,i],c,f,h)}var Qw={kernelName:Qi,backendName:"webgpu",kernelFunc:GA};function OA(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,filter:s,dy:i}=t,{strides:a,pad:u,dilations:p}=o,l=N.computeDilation2DInfo(n.shape,s.shape,a,u,"NHWC",p),c=n.dtype,m=new Tp(l,c),f=[{type:"int32",data:[l.filterHeight,l.filterWidth]},{type:"int32",data:[l.padInfo.top,l.padInfo.left]},{type:"int32",data:[l.strideHeight,l.strideWidth]},{type:"int32",data:[l.dilationHeight,l.dilationWidth]},{type:"int32",data:[S.sizeFromShape(l.outShape)]}],h=Ct({backend:e,attrs:{shape:l.inShape,value:0,dtype:c}});return e.runWebGPUProgram(m,[n,s,i],c,f,h)}var Jw={kernelName:Zi,backendName:"webgpu",kernelFunc:OA};var Ap=class{constructor(t,e,o){this.variableNames=["Image"],this.uniforms="alpha: f32,",this.workgroupSize=[64,1,1],this.pixelsOpType=Sr.DRAW,this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.type=e,this.textureFormat=o,this.shaderKey=`draw_${e}_${o}`}getUserCode(){let t,e=this.type==="float32"?"value":"value / 255.0";return t=`
      if (uniforms.numChannels == 1) {
        rgba[0] = ${e};
        rgba[1] = ${e};
        rgba[2] = ${e};
      } else {
        rgba[d] = ${e};
      }`,`
       @group(0) @binding(0) var outImage : texture_storage_2d<${this.textureFormat}, write>;
       ${D("index")} {
         if (index < uniforms.size) {
           var rgba = vec4<f32>(0.0, 0.0, 0.0, uniforms.alpha);
           for (var d = 0; d < uniforms.numChannels; d = d + 1) {
             let value = f32(inBuf[index * uniforms.numChannels + d]);
             ${t}
           }
           rgba.x = rgba.x * rgba.w;
           rgba.y = rgba.y * rgba.w;
           rgba.z = rgba.z * rgba.w;
           let coords = getCoordsFromIndex(index);
           textureStore(outImage, vec2<i32>(coords.yx), rgba);
         }
       }
      `}};function WA(r){let{inputs:t,backend:e,attrs:o}=r,{image:n}=t,{canvas:s,options:i}=o,[a,u]=n.shape.slice(0,2),{imageOptions:p}=i||{},l=p?.alpha||1,c=e.device.features.has("bgra8unorm-storage")?"bgra8unorm":"rgba8unorm",m=[a,u],f=new Ap(m,n.dtype,c);s.width=u,s.height=a;let h="webgpu",b=s.getContext(h),x;b||(x=new OffscreenCanvas(u,a),b=x.getContext(h));let C=n.shape.length===3?n.shape[2]:1;b.configure({device:e.device,format:c,usage:GPUTextureUsage.STORAGE_BINDING,alphaMode:"premultiplied"});let k="int32",v=e.makeTensorInfo(m,k),I=e.tensorMap.get(v.dataId);I.resource=b.getCurrentTexture(),I.external=!0;let T=[{type:"uint32",data:[C]},{type:"float32",data:[l]}];if(e.runWebGPUProgram(f,[n],k,T,v),x){let R=s.getContext("2d");if(!R)throw new Error("Please make sure this canvas has only been used for 2d or webgpu context!");R.drawImage(x,0,0)}return e.disposeData(v.dataId),n}var tS={kernelName:zs,backendName:"webgpu",kernelFunc:WA};var jm=ct({opType:q.MUL,cpuKernelImpl:Mb,supportsComplex:!0}),eS={kernelName:Fr,backendName:"webgpu",kernelFunc:jm};function Ym(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{axis:s,keepDims:i}=o;return me(n,s,i,"sum",e)}var rS={kernelName:"Sum",backendName:"webgpu",kernelFunc:Ym};function UA(r){let{inputs:t,backend:e,attrs:o}=r,{equation:n}=o,s=t,{allDims:i,summedDims:a,idDims:u}=N.decodeEinsumEquation(n,s.length);N.checkEinsumDimSizes(i.length,u,s);let{path:p,steps:l}=N.getEinsumComputePath(a,u),c=l.length,m=null,f=i.length,h=[];for(let b=0;b<c;++b){for(let x of l[b]){let{permutationIndices:C,expandDims:k}=N.getEinsumPermutation(f,u[x]),v;N.isIdentityPermutation(C)?v=s[x]:(v=Kt({inputs:{x:s[x]},backend:e,attrs:{perm:C}}),h.push(v));let I=v.shape.slice();for(let T=0;T<k.length;++T)I.splice(k[T],0,1);S.arraysEqual(v.shape,I)||(v=G({inputs:{x:v},backend:e,attrs:{shape:I}}),h.push(v)),m===null?m=v:(m=jm({inputs:{a:v,b:m},backend:e}),h.push(m))}b<c-1&&(p[b]>=0&&(m=Ym({inputs:{x:m},backend:e,attrs:{axis:p[b]-(i.length-f),keepDims:!1}}),h.push(m)),f--)}for(let b of h)b!==m&&e.disposeData(b.dataId);return m}var oS={kernelName:Ji,backendName:"webgpu",kernelFunc:UA};var VA=j({opType:P.ELU}),nS={kernelName:"Elu",backendName:"webgpu",kernelFunc:VA};var HA=r=>{let{inputs:t,backend:e}=r,{dy:o,y:n}=t,s=new vr(q.ELU_DER,o.shape,n.shape);return e.runWebGPUProgram(s,[o,n],o.dtype)},sS={kernelName:ta,backendName:"webgpu",kernelFunc:HA};var qA=ct({opType:q.EQUAL,dtype:"bool",cpuKernelImpl:wb}),iS={kernelName:pn,backendName:"webgpu",kernelFunc:qA};var KA=j({opType:P.ERF}),aS={kernelName:"Erf",backendName:"webgpu",kernelFunc:KA};var XA=j({opType:P.EXP,cpuKernelImpl:Sb,dtype:"float32"}),uS={kernelName:"Exp",backendName:"webgpu",kernelFunc:XA};function Rp(r){let{inputs:t,attrs:e,backend:o}=r,{dim:n}=e,{input:s}=t,i=s.shape.length,a=s.shape.slice(),u=n;return n<0&&(S.assert(-(i+1)<=n,()=>`Axis must be in the interval [${-(i+1)}, ${i}]`),u=i+n+1),a.splice(u,0,1),G({inputs:{x:s},backend:o,attrs:{shape:a}})}var pS={kernelName:cn,backendName:"webgpu",kernelFunc:Rp};var jA=j({opType:P.EXPM1,cpuKernelImpl:Cb}),lS={kernelName:$r,backendName:"webgpu",kernelFunc:jA};var Ai=class{constructor(t,e){this.variableNames=["real","imag"],this.outputShape=[],this.uniforms="exponentMultiplier : f32, denominator: f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.component=t,this.shaderKey=`fft_${t}`}getUserCode(){return`
    fn unaryOpComplex(real: f32, expR: f32, imag: f32, expI: f32) -> f32 {
      ${this.component==="real"?"return real * expR - imag * expI;":"return real * expI + imag * expR;"}
    }

    fn mulMatDFT(batch: i32, index: i32) -> f32 {
      let indexRatio = f32(index) / f32(uniforms.realShape[1]);
      let exponentMultiplierTimesIndexRatio =
          uniforms.exponentMultiplier * indexRatio;

      var result = 0.0;

      for (var i = 0; i < uniforms.realShape[1]; i = i + 1) {
        // x = (-2|2 * PI / N) * index * i;
        let x = exponentMultiplierTimesIndexRatio * f32(i);
        let expR = cos(x);
        let expI = sin(x);
        let real = getReal(batch, i);
        let imag = getImag(batch, i);

        result = result +
            unaryOpComplex(real, expR, imag, expI) / uniforms.denominator;
      }

      return result;
    }

    ${D("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        setOutputAtIndex(index, mulMatDFT(coords[0], coords[1]));
      }
    }
  `}};function Fp(r,t,e){let o=e.tensorMap.get(r.dataId),n=S.sizeFromShape(r.shape),s=r.shape[r.shape.length-1],i=n/s,a=[],u=G({inputs:{x:r},backend:e,attrs:{shape:[i,s]}});a.push(u);let p=u.shape,l=new Ai("real",p),c=new Ai("imag",p),m=[{dataId:o.complexTensorInfos.real.dataId,dtype:o.complexTensorInfos.real.dtype,shape:p},{dataId:o.complexTensorInfos.imag.dataId,dtype:o.complexTensorInfos.imag.dtype,shape:p}],f=t?2*Math.PI:-2*Math.PI,h=t?p[1]:1,b=[{type:"float32",data:[f]},{type:"float32",data:[h]}],x=e.runWebGPUProgram(l,m,"float32",b);a.push(x);let C=e.runWebGPUProgram(c,m,"float32",b);a.push(C);let k=Se({inputs:{real:x,imag:C},backend:e});a.push(k);let v=G({inputs:{x:k},backend:e,attrs:{shape:r.shape}});return a.forEach(I=>e.disposeData(I.dataId)),v}function YA(r){let{inputs:t,backend:e}=r,{input:o}=t;return Fp(o,!1,e)}var cS={kernelName:"FFT",backendName:"webgpu",kernelFunc:YA};var Pp=class{constructor(t){this.outputShape=[],this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="flipLeftRight"}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let coordX = uniforms.xShape[2] - coords[2] - 1;
          let outputValue = getX(coords[0], coords[1], coordX, coords[3]);
          setOutputAtIndex(index, outputValue);
        }
      }
    `}};var mS={kernelName:oa,backendName:"webgpu",kernelFunc:({inputs:r,backend:t})=>{let{image:e}=r,o=t,n=new Pp(e.shape);return o.runWebGPUProgram(n,[e],e.dtype)}};var ZA=j({opType:P.FLOOR,cpuKernelImpl:vb}),fS={kernelName:Nr,backendName:"webgpu",kernelFunc:ZA};var QA=ct({opType:q.FLOOR_DIV,cpuKernelImpl:kb,dtype:"int32"}),dS={kernelName:Tr,backendName:"webgpu",kernelFunc:QA};var Mp=class{constructor(t,e,o=!1){this.pixelsOpType=Sr.FROM_PIXELS,this.outputShape=[0],this.variableNames=[],this.workgroupSize=[256,1,1],this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[e,1,1]),this.importVideo=o,this.shaderKey=`fromPixels_${this.importVideo}`}getUserCode(){let t=this.importVideo?"textureLoad(src, vec2<i32>(coords.yx));":"textureLoad(src, vec2<i32>(coords.yx), 0)";return`
      @binding(1) @group(0) var src: ${this.importVideo?"texture_external":"texture_2d<f32>"};
      ${D("index")} {
        let flatIndex = index * uniforms.numChannels;
        if (flatIndex < uniforms.size) {
          let coords = getCoordsFromIndex(flatIndex);
          let values = ${t};
          for (var i = 0; i < uniforms.numChannels; i = i + 1) {
            result[flatIndex + i] = i32(floor(255.0 * values[i]));
          }
        }
      }
  `}};var hS={kernelName:Ws,backendName:"webgpu",kernelFunc:JA},Ms,Zm=L().getBool("CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU");function JA(r){let{inputs:t,backend:e,attrs:o}=r,{pixels:n}=t,{numChannels:s}=o;if(n==null)throw new Error("pixels passed to tf.browser.fromPixels() can not be null");let i=typeof HTMLVideoElement<"u"&&n instanceof HTMLVideoElement,a=typeof HTMLImageElement<"u"&&n instanceof HTMLImageElement,u=typeof HTMLCanvasElement<"u"&&n instanceof HTMLCanvasElement||typeof OffscreenCanvas<"u"&&n instanceof OffscreenCanvas,p=typeof ImageBitmap<"u"&&n instanceof ImageBitmap,[l,c]=i?[n.videoWidth,n.videoHeight]:[n.width,n.height],m=[c,l,s],f=L().getBool("WEBGPU_IMPORT_EXTERNAL_TEXTURE")&&i,h=i||a;if(p||u||h){let k;if(f)k=e.device.importExternalTexture({source:n});else{if(h){let it=L().getBool("CANVAS2D_WILL_READ_FREQUENTLY_FOR_GPU");(Ms==null||it!==Zm)&&(Zm=it,Ms=document.createElement("canvas").getContext("2d",{willReadFrequently:Zm})),Ms.canvas.width=l,Ms.canvas.height=c,Ms.drawImage(n,0,0,l,c),n=Ms.canvas}let H=GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING,J=e.textureManager.acquireTexture(m[1],m[0],"rgba8unorm",H);e.queue.copyExternalImageToTexture({source:n},{texture:J},[m[1],m[0]]),k=J}let v=S.sizeFromShape(m),I=S.computeStrides(m),T=new Mp(m,s,f),R=[{type:"uint32",data:[v]},{type:"uint32",data:[s]},{type:"uint32",data:[...I]}],M=e.makeTensorInfo([c,l],"int32"),z=e.tensorMap.get(M.dataId);z.resource=k;let B=e.runWebGPUProgram(T,[M],"int32",R);return e.disposeData(M.dataId),B}let b=n.data,x=b;if(s!=null&&s!==4){x=new Uint8Array(n.width*n.height*s);let k=b.length,v=0;for(let I=0;I<k;I++)I%4<s&&(x[v++]=b[I])}let C=e.makeTensorInfo(m,"int32",new Int32Array(x));return e.uploadToGPU(C.dataId),C}var _p=class{constructor(t,e,o,n,s){this.uniforms="varianceEpsilon : f32,",this.workgroupSize=[128,1,1],this.size=!0,this.variableNames=["x","mean","variance"],N.assertAndGetBroadcastShape(t,e),N.assertAndGetBroadcastShape(t,o),this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),n!=null&&(N.assertAndGetBroadcastShape(t,n),this.variableNames.push("offset")),s!=null&&(N.assertAndGetBroadcastShape(t,s),this.variableNames.push("scale")),this.offsetShape=n,this.scaleShape=s,this.shaderKey="batchNorm"}getUserCode(){let t="0.0";this.offsetShape!=null&&(t="getOffsetByOutputIndex(index)");let e="1.0";return this.scaleShape!=null&&(e="getScaleByOutputIndex(index)"),`
      ${D("index")} {
        if (index < uniforms.size)
        {
          let xValue = getXByOutputIndex(index);
          let meanValue = getMeanByOutputIndex(index);
          let varianValue = getVarianceByOutputIndex(index);
          let offsetValue = ${t};
          let scaleValue = ${e};
          let inv = scaleValue * inverseSqrt(varianValue + f32(uniforms.varianceEpsilon));
          setOutputAtIndex(index,dot(vec3<f32>(xValue, -meanValue, offsetValue), vec3<f32>(inv, inv, 1.0)));
        }
      }
  `}};var gS={kernelName:mn,backendName:"webgpu",kernelFunc:({inputs:r,attrs:t,backend:e})=>{let{x:o,scale:n,offset:s,mean:i,variance:a}=r,{varianceEpsilon:u}=t,p=e,l=[o,i,a],c=null;s!=null&&(c=s.shape,l.push(s));let m=null;n!=null&&(m=n.shape,l.push(n));let f=new _p(o.shape,i.shape,a.shape,c,m),h=[{type:"float32",data:[u]}];return p.runWebGPUProgram(f,l,o.dtype,h)}};function tR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,filter:s,bias:i,preluActivationWeights:a}=t,{strides:u,pad:p,dataFormat:l,dilations:c,dimRoundingMode:m,activation:f,leakyreluAlpha:h}=o,b=N.convertConv2DDataFormat(l),x=N.computeConv2DInfo(n.shape,s.shape,u,c,p,m,!1,b);return dp({x:n,filter:s,convInfo:x,backend:e,bias:i,preluActivationWeights:a,leakyreluAlpha:h,activation:f})}var xS={kernelName:Vs,backendName:"webgpu",kernelFunc:tR};function eR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,filter:s,bias:i,preluActivationWeights:a}=t,{strides:u,pad:p,dilations:l,dimRoundingMode:c,activation:m,leakyreluAlpha:f}=o,h=l;h==null&&(h=[1,1]),S.assert(N.eitherStridesOrDilationsAreOne(u,h),()=>`Error in depthwiseConv2d: Either strides or dilations must be 1. Got strides ${u} and dilations '${h}'`);let b=N.computeConv2DInfo(n.shape,s.shape,u,h,p,c,!0),x=[n,s],C=i!=null,k=a!=null;C&&x.push(i),k&&x.push(a);let v=[{type:"int32",data:[b.padInfo.top,b.padInfo.left]},{type:"int32",data:[b.inHeight,b.inWidth]}],I;return b.outHeight>4&&b.outWidth>4&&b.strideWidth<=2&&b.inChannels===b.outChannels&&b.dilationHeight===1&&b.dilationWidth===1&&b.inChannels%4===0?(I=new Fs(b,C,m,k),v.push({type:"int32",data:[I.virtualWidth]})):(I=new Ps(b,C,m,k),v.push({type:"int32",data:[b.filterHeight]},{type:"int32",data:[b.filterWidth]},{type:"int32",data:[b.strideHeight,b.strideWidth]},{type:"int32",data:[b.dilationHeight,b.dilationWidth]})),m==="leakyrelu"&&(v.push({type:"float32",data:[f]}),I.uniforms+=" alpha : f32,"),e.runWebGPUProgram(I,x,"float32",v)}var yS={kernelName:Hs,backendName:"webgpu",kernelFunc:eR};var Bp=class{constructor(t,e){this.variableNames=["A","indices"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey=`gathernd_${t}`,this.sliceDim=t,this.uniforms=`sliceDim : i32, strides : ${ht(t)},`}getUserCode(){let t;return this.sliceDim>1?t="uniforms.strides[j]":t="uniforms.strides",`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          var flattenIndex = 0;
          for (var j = 0; j < uniforms.sliceDim; j = j + 1) {
            let indexTemp = i32(round(getIndices(coords[0], j)));
            let strideNum = ${t};
            flattenIndex = flattenIndex + indexTemp * strideNum;
          }

          setOutputAtIndex(index, getA(flattenIndex, coords[1]));
        }
      }
      `}};function rR(r){let{inputs:t,backend:e}=r,{params:o,indices:n}=t,s=n.shape,i=s[s.length-1],a=S.sizeFromShape(o.shape),[u,p,l,c]=N.prepareAndValidate(o,n),m=G({inputs:{x:n},backend:e,attrs:{shape:[p,i]}}),f=G({inputs:{x:o},backend:e,attrs:{shape:[S.sizeFromShape(o.shape)/l,l]}});if(e.shouldExecuteOnCPU([o,n])||o.dtype==="string"){let k=e.readSync(n.dataId),v=e.bufferSync(o),I=Ib(k,v,o.dtype,p,i,l,c,o.shape,a);return e.makeTensorInfo(u,o.dtype,I.values)}let h=new Bp(i,[p,l]),b=[{type:"int32",data:[i]},{type:"int32",data:c}],x=e.runWebGPUProgram(h,[f,m],f.dtype,b),C=G({inputs:{x},backend:e,attrs:{shape:u}});return e.disposeData(m.dataId),e.disposeData(f.dataId),e.disposeData(x.dataId),C}var bS={kernelName:na,backendName:"webgpu",kernelFunc:rR};var zp=class{constructor(t,e){this.variableNames=["A","indices"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.slice(),this.aShape=t,this.outputShape=e,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="gather"}getUserCode(){let t=oR(this.aShape);return`
      ${D("index")} {
        if (index < uniforms.size) {
          let resRC = getCoordsFromIndex(index);
          let indexZ = i32(getIndices(resRC.x, resRC.z));
          let inBounds = select(0.0, 1.0, indexZ >= 0 && indexZ < uniforms.aShape[2]);
          setOutputAtIndex(index, inBounds * getA(${t}));
        }
      }
    `}};function oR(r){let t=["resRC.x","resRC.y","resRC.z","resRC.w"],e=[];for(let o=0;o<r.length;o++)o===2?e.push("indexZ"):e.push(`${t[o]}`);return e.join()}function Qm(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,indices:s}=t,{axis:i,batchDims:a}=o,u=S.parseAxisParam(i,n.shape)[0],p=N.segment_util.collectGatherOpShapeInfo(n,s,u,a),l=S.sizeFromShape(s.shape),c=[],m=G({inputs:{x:n},backend:e,attrs:{shape:[p.batchSize,p.outerSize,p.dimSize,p.sliceSize]}}),f=G({inputs:{x:s},backend:e,attrs:{shape:[p.batchSize,l/p.batchSize]}});c.push(m),c.push(f);let h=[p.batchSize,p.outerSize,l/p.batchSize,p.sliceSize];if(e.shouldExecuteOnCPU([n,s])){let v=e.tensorMap.get(f.dataId).values,I=st(f.shape,f.dtype,v),R=e.tensorMap.get(m.dataId).values,M=st(m.shape,m.dtype,R),z=Eb(M,I,h);return c.forEach(B=>e.disposeData(B.dataId)),e.makeTensorInfo(p.outputShape,z.dtype,z.values)}let b=new zp(m.shape,h),x=e.runWebGPUProgram(b,[m,f],m.dtype);c.push(x);let C=G({inputs:{x},backend:e,attrs:{shape:p.outputShape}});return c.forEach(k=>e.disposeData(k.dataId)),C}var wS={kernelName:fn,backendName:"webgpu",kernelFunc:Qm};var nR=ct({opType:q.GREATER,cpuKernelImpl:Nb,dtype:"bool"}),SS={kernelName:dn,backendName:"webgpu",kernelFunc:nR};var sR=ct({opType:q.GREATER_EQUAL,dtype:"bool",cpuKernelImpl:$b}),CS={kernelName:Dr,backendName:"webgpu",kernelFunc:sR};function iR(r){let{inputs:t,backend:e}=r,{input:o}=t;return Fp(o,!0,e)}var vS={kernelName:sa,backendName:"webgpu",kernelFunc:iR};var aR=j({opType:P.IS_FINITE,dtype:"bool"}),kS={kernelName:hn,backendName:"webgpu",kernelFunc:aR};var uR=j({opType:P.IS_INF,dtype:"bool"}),IS={kernelName:gn,backendName:"webgpu",kernelFunc:uR};var pR=j({opType:P.IS_NAN,dtype:"bool"}),ES={kernelName:xn,backendName:"webgpu",kernelFunc:pR};function lR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{alpha:s}=o,i=[{type:"float32",data:[s]}],a=new ce(n.shape,P.LEAKYRELU,"alpha : f32,");return e.runWebGPUProgram(a,[n],"float32",i)}var $S={kernelName:yn,backendName:"webgpu",kernelFunc:lR};var cR=ct({opType:q.LESS,dtype:"bool",cpuKernelImpl:Db}),NS={kernelName:bn,backendName:"webgpu",kernelFunc:cR};var mR=ct({opType:q.LESS_EQUAL,dtype:"bool",cpuKernelImpl:Tb}),TS={kernelName:wn,backendName:"webgpu",kernelFunc:mR};var Lp=class{constructor(t){this.variableNames=[],this.outputShape=[],this.uniforms="start : f32, step : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[t],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="linSpace"}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          setOutputAtIndex(index, uniforms.start + f32(index) * uniforms.step);
        }
      }
    `}};function fR(r){let{backend:t,attrs:e}=r,{start:o,stop:n,num:s}=e,i=(n-o)/(s-1),a=new Lp(s),u=[{type:"float32",data:[o]},{type:"float32",data:[i]}];return t.runWebGPUProgram(a,[],"float32",u)}var DS={kernelName:aa,backendName:"webgpu",kernelFunc:fR};var dR=j({opType:P.LOG,cpuKernelImpl:Ab}),AS={kernelName:"Log",backendName:"webgpu",kernelFunc:dR};var hR=j({opType:P.LOG1P}),RS={kernelName:Cn,backendName:"webgpu",kernelFunc:hR};var gR=ct({opType:q.LOGICAL_AND,dtype:"bool"}),FS={kernelName:ua,backendName:"webgpu",kernelFunc:gR};var xR=j({opType:P.LOGICAL_NOT}),PS={kernelName:pa,backendName:"webgpu",kernelFunc:xR};var yR=ct({opType:q.LOGICAL_OR}),MS={kernelName:la,backendName:"webgpu",kernelFunc:yR};var _S=`
  var powValue = 0.0;
  let basis = uniforms.bias + uniforms.alpha * sum;
  if (uniforms.beta == 0.5) {
    powValue = inverseSqrt(basis);
  } else if (uniforms.beta == 1.0) {
    powValue = 1.0 / basis;
  } else {
    powValue = exp(log(basis) * (-uniforms.beta));
  }
`,Gp=class{constructor(t){this.outputShape=[],this.variableNames=["x"],this.uniforms="radius : i32, bias : f32, alpha : f32, beta : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="lrn"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let b = coords[0];
        let r = coords[1];
        let c = coords[2];
        let d = coords[3];

        let x = getX(b, r, c, d);
        var sum = 0.0;
        for (var i = -uniforms.radius; i <= uniforms.radius; i = i + 1) {
          let idx = d + i;
          if (idx >= 0 && idx < uniforms.xShape[3]) {
            let z = getX(b, r, c, idx);
            sum = sum + z * z;
          }
        }
        ${_S}

        setOutputAtIndex(index, x * powValue);
      }
    }
  `}},Op=class{constructor(t,e){this.outputShape=[],this.variableNames=["x"],this.uniforms="radius : i32, bias : f32, alpha : f32, beta : f32,",this.workgroupSize=[256,1,1],this.maxAllowRadius=16,S.assert(e<=this.maxAllowRadius,()=>`Radius must be less than or equal to ${this.maxAllowRadius}, current radius is ${e}`),this.outputShape=t,this.elementsPerWorkgroup=this.workgroupSize[0]-2*this.maxAllowRadius,this.dispatchLayout={x:[3],y:[2],z:[0,1]},this.dispatch=A(this.dispatchLayout,this.outputShape,[this.elementsPerWorkgroup,this.workgroupSize[1],this.workgroupSize[2]]),this.shaderKey="lrn_shared"}getUserCode(){return`
    var <workgroup>lrnSub: array<f32, ${this.workgroupSize[0]}>;
    const elementsPerWorkgroup = ${this.elementsPerWorkgroup};
    const maxAllowRadius = ${this.maxAllowRadius};

    ${D()} {
      let localDepth = i32(localId.x);
      let workgroupDepth = i32(workgroupId.x) * elementsPerWorkgroup;
      let xDepth = workgroupDepth + localDepth - maxAllowRadius;
      let b = i32(globalId.z) / uniforms.xShape[1];
      let r = i32(globalId.z) - b * uniforms.xShape[1];
      let c = i32(globalId.y);
      let d = workgroupDepth + localDepth;

      var x = 0.0;
      if (xDepth >= 0 && xDepth < uniforms.xShape[3]) {
        x = getX(b, r, c, xDepth);
      }
      lrnSub[localDepth] = x;
      workgroupBarrier();

      if (localDepth < elementsPerWorkgroup && d < uniforms.outShape[3]) {
        var sum = 0.0;
        let index = localDepth + maxAllowRadius;
        for (var i = -uniforms.radius; i <= uniforms.radius; i = i + 1) {
          let z = lrnSub[index + i];
          sum = sum + z * z;
        }
        ${_S}

        setOutputAtCoords(b, r, c, d, lrnSub[index] * powValue);
      }
    } `}};function bR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{depthRadius:s,bias:i,alpha:a,beta:u}=o,p;s>16?p=new Gp(n.shape):p=new Op(n.shape,s);let l=[{type:"int32",data:[s]},{type:"float32",data:[i]},{type:"float32",data:[a]},{type:"float32",data:[u]}];return e.runWebGPUProgram(p,[n],n.dtype,l)}var BS={kernelName:"LRN",backendName:"webgpu",kernelFunc:bR};var Wp=class{constructor(t){this.outputShape=[],this.variableNames=["inputImage","outputImage","dy"],this.uniforms="depthRadius : i32, bias : f32, alpha : f32, beta : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="lrn_grad"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let b = coords[0];
        let r = coords[1];
        let c = coords[2];

        let MIN_DEPTH_BEGIN = 0;
        let MAX_DEPTH_END = uniforms.outShape[3];
        var result = 0.0;
        for (var d = MIN_DEPTH_BEGIN; d < MAX_DEPTH_END; d++) {
          let depthBegin = max(MIN_DEPTH_BEGIN, d - uniforms.depthRadius);
          let depthEnd = min(MAX_DEPTH_END, d + uniforms.depthRadius + 1);

          var norm = 0.0;
          for (var k = MIN_DEPTH_BEGIN; k < MAX_DEPTH_END; k++) {
            if (k < depthBegin) {
              continue;
            } else if (k >= depthBegin && k < depthEnd) {
              norm += getInputImage(b, r, c, k) * getInputImage(b, r, c, k);
            } else {
              break;
            }
          }

          norm = uniforms.alpha * norm + uniforms.bias;

          for (var k = MIN_DEPTH_BEGIN; k < MAX_DEPTH_END; k++) {
            if (k < depthBegin) {
              continue;
            } else if (k >= depthBegin && k < depthEnd) {
              var dyi = -2.0 * uniforms.alpha * uniforms.beta
                * getInputImage(b, r, c, k) * getOutputImage(b, r, c, d) / norm;
              if (k == d) {
                dyi += pow(norm, -1.0 * uniforms.beta);
              }
              if (k == coords[3]) {
                dyi *= getDy(b, r, c, d);
                result += dyi;
              }
            } else {
              break;
            }
          }
        }

        setOutputAtIndex(index, result);
      }
    }
  `}};function wR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,y:s,dy:i}=t,{depthRadius:a,bias:u,alpha:p,beta:l}=o,c=new Wp(n.shape),m=[{type:"int32",data:[a]},{type:"float32",data:[u]},{type:"float32",data:[p]},{type:"float32",data:[l]}];return e.runWebGPUProgram(c,[n,s,i],n.dtype,m)}var zS={kernelName:ma,backendName:"webgpu",kernelFunc:wR};var SR=ct({opType:q.MAX,cpuKernelImpl:Fb}),LS={kernelName:Ar,backendName:"webgpu",kernelFunc:SR};function CR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{filterSize:s,strides:i,pad:a,dimRoundingMode:u}=o,l=N.computePool2DInfo(n.shape,s,i,1,a,u);return ep(n,l,"max",e)}var GS={kernelName:vn,backendName:"webgpu",kernelFunc:CR};function vR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{filterSize:s,strides:i,pad:a,dataFormat:u,dimRoundingMode:p}=o,l=[1,1,1],c=N.computePool3DInfo(n.shape,s,i,l,a,p,u),m=new Kr(c,"max"),f=[{type:"int32",data:[c.strideDepth,c.strideHeight,c.strideWidth]},{type:"int32",data:[c.padInfo.front,c.padInfo.top,c.padInfo.left]},{type:"int32",data:[c.inDepth,c.inHeight,c.inWidth]},{type:"int32",data:[c.effectiveFilterDepth,c.effectiveFilterHeight,c.effectiveFilterWidth]}];return e.runWebGPUProgram(m,[n],n.dtype,f)}var OS={kernelName:kn,backendName:"webgpu",kernelFunc:vR};var Up=class{constructor(t){this.variableNames=["dy","maxPos"],this.uniforms=`strides : vec2<i32>, pads : vec2<i32>, dilations : vec2<i32>, filterDims : vec2<i32>,
       outHeight : i32, outWidth : i32`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.inShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="maxPool2DBackprop"}getUserCode(){return`
      ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords[0];
        let d = coords[3];

        let dyRCCorner = vec2<i32>(coords.yz) - uniforms.pads;
        let dyRCorner = dyRCCorner.x;
        let dyCCorner = dyRCCorner.y;

        // Convolve dy(?, ?, d) with pos mask(:, :, d) to get dx(xR, xC, d).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        let lastIndex = uniforms.filterDims[0] * uniforms.filterDims[1] - 1;
        for (var wR = 0; wR < uniforms.filterDims[0]; wR += uniforms.dilations[0]) {
          let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[0]);

          if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
            continue;
          }
          let idyR = i32(dyR);

          for (var wC = 0; wC < uniforms.filterDims[1]; wC += uniforms.dilations[1]) {
            let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[1]);

            if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
              continue;
            }
            let idyC = i32(dyC);

            let dyValue = getDy(batch, idyR, idyC, d);
            let maxPosValue = lastIndex - i32(getMaxPos(batch, idyR, idyC, d));

            // Get the current value, check it against the value from the
            // position matrix.
            let curPosValue = wR * uniforms.filterDims[1] + wC;
            let mask = select(0.0, 1.0, maxPosValue == curPosValue);
            dotProd += dyValue * mask;
          }
        }
        setOutputAtIndex(index, dotProd);
      }
    }
    `}},Vp=class{constructor(t){this.variableNames=["dy","maxPos"],this.uniforms=`strides : vec3<i32>, pads : vec3<i32>, filterDims : vec3<i32>,
      outDepth : i32, outHeight : i32, outWidth : i32`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t.inShape,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="maxPool3DBackprop"}getUserCode(){return`
      ${D("index")} {
      if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
        let batch = coords.x;
        let ch = coords.u;

        let dyCorner = vec3<i32>(coords.y, coords.z, coords.w) - uniforms.pads;
        let dyDCorner = dyCorner.x;
        let dyRCorner = dyCorner.y;
        let dyCCorner = dyCorner.z;

        // Convolve dy(?, ?, ?, ch) with pos mask(:, :, :, d) to get
        // dx(xD, xR, xC, ch).
        // ? = to be determined. : = across all values in that axis.
        var dotProd = 0.0;
        let lastIndex = uniforms.filterDims[0] * uniforms.filterDims[1] * uniforms.filterDims[2] - 1;

        for (var wD = 0; wD < uniforms.filterDims[0]; wD++) {
          let dyD = f32(dyDCorner + wD) / f32(uniforms.strides[0]);

          if (dyD < 0.0 || dyD >= f32(uniforms.outDepth) || fract(dyD) > 0.0) {
            continue;
          }
          let idyD = i32(dyD);

          for (var wR = 0; wR < uniforms.filterDims[1]; wR++) {
            let dyR = f32(dyRCorner + wR) / f32(uniforms.strides[1]);

            if (dyR < 0.0 || dyR >= f32(uniforms.outHeight) || fract(dyR) > 0.0) {
              continue;
            }
            let idyR = i32(dyR);

            for (var wC = 0; wC < uniforms.filterDims[2]; wC++) {
              let dyC = f32(dyCCorner + wC) / f32(uniforms.strides[2]);

              if (dyC < 0.0 || dyC >= f32(uniforms.outWidth) || fract(dyC) > 0.0) {
                continue;
              }
              let idyC = i32(dyC);

              let dyValue = getDy(batch, idyD, idyR, idyC, ch);
              let maxPosValue = lastIndex - i32(getMaxPos(batch, idyD, idyR, idyC, ch));

              // Get the current value, check it against the value from the
              // position matrix.
              let curPosValue = wD * uniforms.filterDims[1] * uniforms.filterDims[2] + wR * uniforms.filterDims[2] + wC;
              let mask = select(0.0, 1.0, maxPosValue == curPosValue);
              dotProd += dyValue * mask;
            }
          }
        }

        setOutputAtIndex(index, dotProd);
      }
    }
    `}};function kR(r){let{inputs:t,backend:e,attrs:o}=r,{dy:n,input:s}=t,i=s,{filterSize:a,strides:u,pad:p,dimRoundingMode:l}=o,c=[1,1,1],m=N.computePool3DInfo(i.shape,a,u,c,p,l),f=new Kr(m,"max",!0),h=[{type:"int32",data:[m.strideDepth,m.strideHeight,m.strideWidth]},{type:"int32",data:[m.padInfo.front,m.padInfo.top,m.padInfo.left]},{type:"int32",data:[m.inDepth,m.inHeight,m.inWidth]},{type:"int32",data:[m.effectiveFilterDepth,m.effectiveFilterHeight,m.effectiveFilterWidth]}],b=e.runWebGPUProgram(f,[i],"int32",h),x=new Vp(m);h=[{type:"int32",data:[m.strideDepth,m.strideHeight,m.strideWidth]},{type:"int32",data:[m.effectiveFilterDepth-1-m.padInfo.front,m.effectiveFilterHeight-1-m.padInfo.top,m.effectiveFilterWidth-1-m.padInfo.left]},{type:"int32",data:[m.effectiveFilterDepth,m.effectiveFilterHeight,m.effectiveFilterWidth]},{type:"int32",data:[m.outDepth]},{type:"int32",data:[m.outHeight]},{type:"int32",data:[m.outWidth]}];let C=e.runWebGPUProgram(x,[n,b],i.dtype,h);return e.disposeData(b.dataId),C}var WS={kernelName:ha,backendName:"webgpu",kernelFunc:kR};function IR(r){let{inputs:t,backend:e,attrs:o}=r,{dy:n,input:s,output:i}=t,a=s;Gu([s,i],"maxPoolGrad");let{filterSize:u,strides:p,pad:l,dimRoundingMode:c}=o,m=N.computePool2DInfo(a.shape,u,p,1,l,c),f=new nr(m,"max",!0),h=[{type:"int32",data:[m.strideHeight,m.strideWidth]},{type:"int32",data:[m.padInfo.top,m.padInfo.left]},{type:"int32",data:[m.dilationHeight,m.dilationWidth]},{type:"int32",data:[m.inHeight,m.inWidth]},{type:"int32",data:[m.effectiveFilterHeight,m.effectiveFilterWidth]}],b=e.runWebGPUProgram(f,[a],"int32",h),x=new Up(m);h=[{type:"int32",data:[m.strideHeight,m.strideWidth]},{type:"int32",data:[m.effectiveFilterHeight-1-m.padInfo.top,m.effectiveFilterWidth-1-m.padInfo.left]},{type:"int32",data:[m.dilationHeight,m.dilationWidth]},{type:"int32",data:[m.effectiveFilterHeight,m.effectiveFilterWidth]},{type:"int32",data:[m.outHeight]},{type:"int32",data:[m.outWidth]}];let C=e.runWebGPUProgram(x,[n,b],a.dtype,h);return e.disposeData(b.dataId),C}var US={kernelName:da,backendName:"webgpu",kernelFunc:IR};function ER(r){let{inputs:t,backend:e,attrs:o}=r,{filterSize:n,strides:s,pad:i,includeBatchInIndex:a}=o,{x:u}=t;S.assert(u.shape.length===4,()=>`Error in maxPool: input must be rank 4 but got rank ${u.shape.length}.`);let p=[1,1];S.assert(N.eitherStridesOrDilationsAreOne(s,p),()=>`Error in maxPool: Either strides or dilations must be 1. Got strides ${s} and dilations '${p}'`);let l=N.computePool2DInfo(u.shape,n,s,p,i),c=[{type:"int32",data:[l.strideHeight,l.strideWidth]},{type:"int32",data:[l.padInfo.top,l.padInfo.left]},{type:"int32",data:[l.dilationHeight,l.dilationWidth]},{type:"int32",data:[l.inHeight,l.inWidth]},{type:"int32",data:[l.effectiveFilterHeight,l.effectiveFilterWidth]}],m=new nr(l,"max",!1),f=e.runWebGPUProgram(m,[u],u.dtype,c);m=new nr(l,"max",!0,!0,a);let h=e.runWebGPUProgram(m,[u],"int32",c);return[f,h]}var VS={kernelName:ga,backendName:"webgpu",kernelFunc:ER};function $R(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{axis:s,keepDims:i}=o;return me(n,s,i,"min",e)}var HS={kernelName:"Min",backendName:"webgpu",kernelFunc:$R};var NR=ct({opType:q.MIN,cpuKernelImpl:Pb}),qS={kernelName:Rr,backendName:"webgpu",kernelFunc:NR};var Hp=class{constructor(t,e,o){this.uniforms="",this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.map((n,s)=>n[0]+t[s]+n[1]),this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.xShape=t,e.map((n,s)=>{this.uniforms+=` pad${s} : vec2<i32>,`}),this.offset=o==="reflect"?0:1,this.shaderKey=`mirrorPad_${o}`}getUserCode(){let t=this.xShape.length,e=this.xShape.map((p,l)=>`uniforms.pad${l}[0]`).join(","),o=this.xShape.map((p,l)=>`uniforms.pad${l}[0] + uniforms.xShape${t>1?`[${l}]`:""}`).join(","),n=t===1?"start":"start[i]",s=t===1?"end":"end[i]",i=t===1?"outC":"outC[i]",a=ht(t),u=t>1?["coords[0]","coords[1]","coords[2]","coords[3]"].slice(0,t):"coords";return`
      ${D("index")} {
        if (index < uniforms.size) {
          let start = ${a}(${e});
          let end = ${a}(${o});
          var outC = getCoordsFromIndex(index);
          for (var i = 0; i < ${t}; i = i + 1) {
            if (${i} < ${n}) {
              ${i} = ${n} * 2 - ${i} - ${this.offset};
            } else if(${i} >= ${s}) {
              ${i} = (${s} - 1) * 2 - ${i} + ${this.offset};
            }
          }
          let coords = outC - start;
          setOutputAtIndex(index, getX(${u}));
        }
      }
    `}};var KS={kernelName:En,backendName:"webgpu",kernelFunc:({inputs:r,attrs:t,backend:e})=>{let{x:o}=r,{paddings:n,mode:s}=t,i=e,a=n.map(l=>({type:"int32",data:[l[0],l[1]]})),u=new Hp(o.shape,n,s);return i.runWebGPUProgram(u,[o],o.dtype,a)}};var TR=ct({opType:q.MOD}),XS={kernelName:"Mod",backendName:"webgpu",kernelFunc:TR};var qp=class{constructor(t,e){this.variableNames=["probs"],this.outputShape=[],this.uniforms="seed : f32, numOutcomes: i32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[t,e],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="multinomial"}getUserCode(){return`
    //Based on the work of Dave Hoskins
    //https://www.shadertoy.com/view/4djSRW
    fn random (seed : f32, resultUV : vec2<f32>) -> f32 {
      let HASHSCALE1 = 443.8975;
      let p = resultUV * seed;
      var p3  = fract(vec3<f32>(p.xyx) * HASHSCALE1);
      p3 = p3 + dot(p3, p3.yzx + 19.19);
      return fract((p3.x + p3.y) * p3.z);
    }

    ${D("index")} {
      if (index < uniforms.size) {
        let coords = getOutputCoords();
        let batch = coords[0];

        let resUV = vec2<f32>(f32(coords[1]) / f32(uniforms.outShape[1]),
            f32(coords[0]) / f32(uniforms.outShape[0]));
        let r = random(uniforms.seed, resUV);
        var cdf = 0.0;
        for (var i = 0; i < uniforms.numOutcomes - 1; i = i + 1) {
          cdf = cdf + getProbs(batch, i);

          if (r < cdf) {
            setOutputAtIndexI32(index, i);
            return;
          }
        }

        // If no other event happened, last event happened.
        setOutputAtIndexI32(index, uniforms.numOutcomes - 1);
      }
    }
  `}};var Kp=class{constructor(t){this.variableNames=["logits"],this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=[this.outputShape[0],1,1],this.outputShape[1]>=4096?this.workgroupSize=[256,1,1]:this.workgroupSize=[64,1,1],this.shaderKey="softmax"}getUserCode(){return`
    var<workgroup> buf : array<f32, ${this.workgroupSize[0]}>;
    var<workgroup> rowMaxShared : f32;
    var<workgroup> rowSumShared : f32;
    const blockSize = ${this.workgroupSize[0]};
    ${D("index")} {
      let row = index / blockSize;
      let tid = i32(localId.x);
      let cols = uniforms.outShape[1];

      var threadMax = -3.402823e+38f;
      for (var col = tid; col < cols; col += blockSize) {
        let value = getLogits(row, col);
        threadMax = max(threadMax, value);
      }
      if (tid < cols) {
        buf[tid] = threadMax;
      }
      workgroupBarrier();

      var reduceSize = min(cols, blockSize);
      for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
        reduceSize = currSize + (reduceSize & 1);
        if (tid < currSize) {
          buf[tid] = max(buf[tid], buf[tid + reduceSize]);
        }
        workgroupBarrier();
      }

      if (tid == 0) {
        rowMaxShared = buf[0];
      }
      workgroupBarrier();

      var threadSum = 0.0;
      for (var col = tid; col < cols; col += blockSize) {
        let subExp = exp(getLogits(row, col) - rowMaxShared);
        threadSum += subExp;
      }
      buf[tid] = threadSum;
      workgroupBarrier();

      for (var currSize = blockSize >> 1;  currSize > 0; currSize = currSize >> 1) {
        if (tid < currSize) {
          buf[tid] = buf[tid] + buf[tid + currSize];
        }
        workgroupBarrier();
      }

      if (tid == 0) {
        rowSumShared = buf[0];
      }
      workgroupBarrier();

      for (var col = tid; col < cols; col += blockSize) {
        let value = exp(getLogits(row, col) - rowMaxShared) / rowSumShared;
        setOutputAtCoords(row, col, value);
      }
  }
    `}};function Jm(r){let{inputs:t,backend:e,attrs:o}=r,{logits:n}=t,{dim:s}=o,i=G({inputs:{x:n},backend:e,attrs:{shape:[S.sizeFromShape(n.shape)/n.shape[s],n.shape[s]]}}),a=new Kp(i.shape),u=e.runWebGPUProgram(a,[i],n.dtype),p=G({inputs:{x:u},backend:e,attrs:{shape:n.shape}});return e.disposeData(i.dataId),e.disposeData(u.dataId),p}var jS={kernelName:Xn,backendName:"webgpu",kernelFunc:Jm};function DR(r){let{inputs:t,backend:e,attrs:o}=r,{logits:n}=t,{numSamples:s,seed:i,normalized:a}=o,u=a?n:Jm({inputs:{logits:n},backend:e,attrs:{dim:n.shape.length-1}}),p=u.shape[0],l=u.shape[1],c=new qp(p,s),m=[{type:"float32",data:[i]},{type:"int32",data:[l]}],f=e.runWebGPUProgram(c,[u],"int32",m);return a||e.disposeData(u.dataId),f}var YS={kernelName:ba,backendName:"webgpu",kernelFunc:DR};function AR(r){let{inputs:t,backend:e}=r,{x:o}=t;if(e.shouldExecuteOnCPU([o])){let s=e.tensorMap.get(o.dataId),[i,a]=_b(s.values,o.shape,o.dtype);return e.makeTensorInfo(a,o.dtype,i)}let n=new ce(o.shape,P.NEG);return e.runWebGPUProgram(n,[o],o.dtype)}var ZS={kernelName:"Neg",backendName:"webgpu",kernelFunc:AR};function RR(r){console.warn("tf.nonMaxSuppression() in webgpu locks the UI thread. Call tf.nonMaxSuppressionAsync() instead");let{inputs:t,backend:e,attrs:o}=r,{boxes:n,scores:s}=t,{maxOutputSize:i,iouThreshold:a,scoreThreshold:u}=o,p=e.readSync(n.dataId),l=e.readSync(s.dataId),{selectedIndices:c}=Is.nonMaxSuppressionV3Impl(p,l,i,a,u);return e.makeTensorInfo([c.length],"int32",new Int32Array(c))}var QS={kernelName:wa,backendName:"webgpu",kernelFunc:RR};function FR(r){console.warn("tf.nonMaxSuppression() in webgpu locks the UI thread. Call tf.nonMaxSuppressionAsync() instead");let{inputs:t,backend:e,attrs:o}=r,{boxes:n,scores:s}=t,{maxOutputSize:i,iouThreshold:a,scoreThreshold:u,softNmsSigma:p}=o,l=e.readSync(n.dataId),c=e.readSync(s.dataId),m=i,f=a,h=u,b=p,{selectedIndices:x,selectedScores:C}=Is.nonMaxSuppressionV5Impl(l,c,m,f,h,b);return[e.makeTensorInfo([x.length],"int32",new Int32Array(x)),e.makeTensorInfo([C.length],"float32",new Float32Array(C))]}var JS={kernelName:Sa,backendName:"webgpu",kernelFunc:FR};var Xp=class{constructor(t,e){this.variableNames=["x"],this.uniforms="onValue : f32, offValue : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[t,e],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="onehot"}getUserCode(){return`
      ${D("index")} {
        if(index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          setOutputAtIndex(index, mix(uniforms.offValue, uniforms.onValue,
                                      f32(i32(round(getX(coords.x))) == coords.y)));
        }
      }
    `}};function PR(r){let{inputs:t,backend:e,attrs:o}=r,{indices:n}=t,{dtype:s,depth:i,onValue:a,offValue:u}=o,p=S.sizeFromShape(n.shape),l=new Xp(p,i),c=G({inputs:{x:n},backend:e,attrs:{shape:[p]}}),m=[{type:"float32",data:[a]},{type:"float32",data:[u]}],f=e.runWebGPUProgram(l,[c],s,m);e.disposeData(c.dataId);let h=[...n.shape,i],b=G({inputs:{x:f},backend:e,attrs:{shape:h}});return e.disposeData(f.dataId),b}var t2={kernelName:Tn,backendName:"webgpu",kernelFunc:PR};function Ri(r){let{inputs:t,backend:e}=r,{x:o}=t;if(o.dtype==="complex64"){let n=kr({inputs:{input:o},backend:e}),s=Ri({inputs:{x:n},backend:e}),i=Po({inputs:{input:o},backend:e}),a=Ri({inputs:{x:i},backend:e}),u=Se({inputs:{real:s,imag:a},backend:e});return e.disposeData(n.dataId),e.disposeData(s.dataId),e.disposeData(i.dataId),e.disposeData(a.dataId),u}else return Ct({attrs:{shape:o.shape,dtype:o.dtype,value:o.dtype==="string"?"":0},backend:e})}var e2={kernelName:Jn,backendName:"webgpu",kernelFunc:Ri};function r2(r){let{inputs:t,backend:e}=r,{x:o}=t;if(o.dtype==="string")throw new Error("onesLike is not supported under string dtype");if(o.dtype==="complex64"){let n=kr({inputs:{input:o},backend:e}),s=r2({inputs:{x:n},backend:e}),i=Po({inputs:{input:o},backend:e}),a=Ri({inputs:{x:i},backend:e}),u=Se({inputs:{real:s,imag:a},backend:e});return e.disposeData(n.dataId),e.disposeData(s.dataId),e.disposeData(i.dataId),e.disposeData(a.dataId),u}else return Ct({attrs:{shape:o.shape,dtype:o.dtype,value:1},backend:e})}var o2={kernelName:Nn,backendName:"webgpu",kernelFunc:r2};function MR(r){let{inputs:t,backend:e,attrs:o}=r,{axis:n}=o;if(t.length===1)return Rp({inputs:{input:t[0]},backend:e,attrs:{dim:n}});let s=t[0].shape,i=t[0].dtype;t.forEach(l=>{S.assertShapesMatch(s,l.shape,"All tensors passed to stack must have matching shapes"),S.assert(i===l.dtype,()=>"All tensors passed to stack must have matching dtypes")});let a=[],u=t.map(l=>{let c=Rp({inputs:{input:l},backend:e,attrs:{dim:n}});return a.push(c),c}),p=Xm({inputs:u,backend:e,attrs:{axis:n}});return a.forEach(l=>e.disposeData(l.dataId)),p}var n2={kernelName:Dn,backendName:"webgpu",kernelFunc:MR};function tf(r,t=!1){let e=r.length,o=ht(e),n=r.map((c,m)=>`uniforms.pad${m}[0]`).join(","),s=r.map((c,m)=>`uniforms.pad${m}[0] + uniforms.xShape${e>1?`[${m}]`:""}`).join(","),i=e>1?`${o}(${n})`:`${n}`,a=e>1?`${o}(${s})`:`${s}`,u=e>1?"any(paddedCoords < start)":"paddedCoords < start",p=e>1?"any(paddedCoords >= end)":"paddedCoords >= end",l=e>1?["coords[0]","coords[1]","coords[2]","coords[3]"].slice(0,e):"coords";return`
        let start = ${i};
        let end = ${a};
        if (${u} || ${p}) {
          setOutputAtIndex(index, ${t?0:"uniforms.constantValue"});
        } else {
          let coords = paddedCoords - start;
          setOutputAtIndex(index, getX(${l}));
        }
  `}var jp=class{constructor(t,e){this.variableNames=["x"],this.uniforms="constantValue : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e.map((o,n)=>o[0]+t[n]+o[1]),this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),e.map((o,n)=>{this.uniforms+=` pad${n} : vec2<i32>,`}),this.xShape=t,this.shaderKey="pad"}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          let paddedCoords = getCoordsFromIndex(index);
          ${tf(this.xShape)}
        }
      }
    `}};var _R=r=>{let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{paddings:s,constantValue:i}=o;if(s.every(p=>S.arraysEqual(p,[0,0])))return Nt({inputs:{x:n},backend:e});if(S.sizeFromShape(n.shape)===0){let p=s.map((l,c)=>l[0]+n.shape[c]+l[1]);return Ct({backend:e,attrs:{shape:p,value:i,dtype:n.dtype}})}let a=[{type:"float32",data:[i]}];s.map(p=>a.push({type:"int32",data:[p[0],p[1]]}));let u=new jp(n.shape,s);return e.runWebGPUProgram(u,[n],n.dtype,a)},s2={kernelName:An,backendName:"webgpu",kernelFunc:_R};var BR=ct({opType:q.POW}),i2={kernelName:"Pow",backendName:"webgpu",kernelFunc:BR};function zR(r){let{inputs:t,backend:e}=r,{x:o,alpha:n}=t,s=new vr(q.PRELU,o.shape,n.shape);return e.runWebGPUProgram(s,[o,n],"float32")}var a2={kernelName:Rn,backendName:"webgpu",kernelFunc:zR};function LR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{axis:s,keepDims:i}=o;return me(n,s,i,"prod",e)}var u2={kernelName:jr,backendName:"webgpu",kernelFunc:LR};var GR=r=>{let{backend:t,attrs:e}=r,{start:o,stop:n,step:s,dtype:i}=e,a=Lb(o,n,s,i);return t.makeTensorInfo([a.length],i,a)},p2={kernelName:va,backendName:"webgpu",kernelFunc:GR};var OR=ct({opType:q.DIV}),l2={kernelName:un,backendName:"webgpu",kernelFunc:OR};var WR=j({opType:P.RECIPROCAL}),c2={kernelName:Fn,backendName:"webgpu",kernelFunc:WR};var UR=j({opType:P.RELU}),m2={kernelName:Pn,backendName:"webgpu",kernelFunc:UR};var VR=j({opType:P.RELU6}),f2={kernelName:zn,backendName:"webgpu",kernelFunc:VR};var Yp=class{constructor(t,e,o){this.variableNames=["x"],this.uniforms="adjustHeightWidth : vec2<f32>, halfPixelCenters : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[t[0],e,o,t[3]],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="resizeBilinear"}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
        let coords = getCoordsFromIndex(index);
          let b = coords[0];
          let d = coords[3];
          let rc = coords.yz;

          let effectiveInSize = vec2<f32>(
            f32(uniforms.xShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.xShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveOutSize = vec2<f32>(
            f32(uniforms.outShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.outShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveInputOverOutputRatioRC =
              effectiveInSize / effectiveOutSize;

          // Fractional source index
          let sourceFracIndexRC =
            (vec2<f32>(rc) + vec2<f32>(uniforms.halfPixelCenters)) *
            effectiveInputOverOutputRatioRC - vec2<f32>(uniforms.halfPixelCenters);

          // Compute the four integer indices.
          let sourceFloorRC = vec2<i32>(sourceFracIndexRC);
          let sourceCeilRC = vec2<i32>(
            min(vec2<f32>(uniforms.xShape.yz) - vec2<f32>(1.0), ceil(sourceFracIndexRC)));

          let topLeft = getX(b, sourceFloorRC.x, sourceFloorRC.y, d);
          let bottomLeft = getX(b, sourceCeilRC.x, sourceFloorRC.y, d);
          let topRight = getX(b, sourceFloorRC.x, sourceCeilRC.y, d);
          let bottomRight = getX(b, sourceCeilRC.x, sourceCeilRC.y, d);

          let fracRC = sourceFracIndexRC - vec2<f32>(sourceFloorRC);

          let top = topLeft + (topRight - topLeft) * fracRC.y;
          let bottom = bottomLeft + (bottomRight - bottomLeft) * fracRC.y;
          let newValue = top + (bottom - top) * fracRC.x;

          setOutputAtIndex(index, newValue);
        }
      }
    `}};function HR(r){let{inputs:t,backend:e,attrs:o}=r,{images:n}=t,{alignCorners:s,size:i,halfPixelCenters:a}=o,[u,p]=i,l=s&&u>1?1:0,c=s&&p>1?1:0,f=[{type:"float32",data:[l,c]},{type:"float32",data:[a?.5:0]}],h=new Yp(n.shape,u,p);return e.runWebGPUProgram(h,[n],"float32",f)}var d2={kernelName:Bn,backendName:"webgpu",kernelFunc:HR};var Zp=class{constructor(t,e){this.variableNames=["dy"],this.uniforms=`effectiveXSize : vec2<i32>, effectiveYSize : vec2<i32>, heightScale : f32, widthScale : f32,
       invHeightScale : f32, invWidthScale : f32, winHeight : i32, winWidth : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.alignCorners=e,this.shaderKey=`resizeBilinearBackprop_${e}`}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let b = coords[0];
          let d = coords[3];
          let r = coords[1];
          let c = coords[2];

          var accumulator = 0.0;

          // Compute bounds for where in dy we will look
          let startRLerp = floor(f32(r) * uniforms.invHeightScale);
          let startDyR = i32(startRLerp - f32(uniforms.winHeight / 2));

          let startCLerp = floor(f32(c) * uniforms.invWidthScale);
          let startDyC = i32(startCLerp - f32(uniforms.winWidth / 2));

          // Loop over dy
          for (var dyROffset = 0; dyROffset < uniforms.winHeight; dyROffset++) {
            let dyR = startDyR + dyROffset;

            // Guard against the window exceeding the bounds of dy
            if (dyR < 0 || dyR >= uniforms.dyShape[1]) {
              continue;
            }

            for (var dyCOffset = 0; dyCOffset < uniforms.winWidth; dyCOffset++) {
              let dyC = startDyC + dyCOffset;

              // Guard against the window exceeding the bounds of dy
              if (dyC < 0 || dyC >= uniforms.dyShape[2]) {
                continue;
              }

              let dxR = f32(dyR) * uniforms.heightScale;
              let topDxRIndex = i32(floor(dxR));
              let bottomDxRIndex = i32(min(ceil(dxR), f32(uniforms.outShape[1] - 1)));
              let dxRLerp = dxR - f32(topDxRIndex);
              let inverseDxRLerp = 1.0 - dxRLerp;

              let dxC = f32(dyC) * uniforms.widthScale;
              let leftDxCIndex = i32(floor(dxC));
              let rightDxCIndex = i32(min(ceil(dxC), f32(uniforms.outShape[2] - 1)));
              let dxCLerp = dxC - f32(leftDxCIndex);
              let inverseDxCLerp = 1.0 - dxCLerp;

              if (r == topDxRIndex && c == leftDxCIndex) {
                // topLeft
                accumulator +=
                  getDy(b, dyR, dyC, d) * inverseDxRLerp * inverseDxCLerp;
              }

              if (r == topDxRIndex && c == rightDxCIndex) {
                // topRight
                accumulator += getDy(b, dyR, dyC, d) * inverseDxRLerp * dxCLerp;
              }

              if (r == bottomDxRIndex && c == leftDxCIndex) {
                // bottomLeft
                accumulator += getDy(b, dyR, dyC, d) * dxRLerp * inverseDxCLerp;
              }

              if (r == bottomDxRIndex && c == rightDxCIndex) {
                // bottomRight
                accumulator += getDy(b, dyR, dyC, d) * dxRLerp * dxCLerp;
              }
            }
          }
          // End loop over dy

          setOutputAtIndex(index, accumulator);
        }
      }
    `}};function qR(r){let{inputs:t,backend:e,attrs:o}=r,{images:n,dy:s}=t,{alignCorners:i}=o,[,a,u]=n.shape,[,p,l]=s.shape,c=[i&&p>1?a-1:a,i&&l>1?u-1:u],m=[i&&p>1?p-1:p,i&&l>1?l-1:l],f=c[0]/m[0],h=c[1]/m[1],b=1/f,x=1/h,C=Math.ceil(b)*2+2,k=Math.ceil(x)*2+2,v=new Zp(n.shape,i),I=[{type:"int32",data:c},{type:"int32",data:m},{type:"float32",data:[f]},{type:"float32",data:[h]},{type:"float32",data:[b]},{type:"float32",data:[x]},{type:"int32",data:[C]},{type:"int32",data:[k]}];return e.runWebGPUProgram(v,[s],s.dtype,I)}var h2={kernelName:Ia,backendName:"webgpu",kernelFunc:qR};var Qp=class{constructor(t,e,o,n){this.variableNames=["x"],this.uniforms="adjustHeightWidth : vec2<f32>, roundBase : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=[t[0],e,o,t[3]],this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.halfPixelCenters=n,this.shaderKey=`resizeNearest_${n}`}getUserCode(){let t;return this.halfPixelCenters?t="max((vec2<f32>(rc) + vec2<f32>(0.5)) * effectiveInputOverOutputRatioRC, vec2<f32>(0.0))":t="vec2<f32>(rc) * effectiveInputOverOutputRatioRC",`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let b = coords[0];
          let d = coords[3];
          let rc = coords.yz;

          let effectiveInSize = vec2<f32>(
            f32(uniforms.xShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.xShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveOutSize = vec2<f32>(
            f32(uniforms.outShape.y) - uniforms.adjustHeightWidth[0],
            f32(uniforms.outShape.z) - uniforms.adjustHeightWidth[1]);

          let effectiveInputOverOutputRatioRC =
              effectiveInSize / effectiveOutSize;

          // Fractional source index
          let sourceFracIndexRC = ${t};

          // Compute the coordinators of nearest neighbor point.
          let inputShapeRC = vec2<f32>(f32(uniforms.xShape.y), f32(uniforms.xShape.z));
          let sourceNearestRC = vec2<i32>(
            min(inputShapeRC - 1.0, floor(sourceFracIndexRC + uniforms.roundBase)));
          let newValue = getX(b, sourceNearestRC.x, sourceNearestRC.y, d);

          setOutputAtIndex(index, newValue);
        }
      }
    `}};function KR(r){let{inputs:t,backend:e,attrs:o}=r,{images:n}=t,{alignCorners:s,halfPixelCenters:i,size:a}=o,[u,p]=a,l=s&&u>1?1:0,c=s&&p>1?1:0,f=[{type:"float32",data:[l,c]},{type:"float32",data:[s?.5:0]}],h=new Qp(n.shape,u,p,i);return e.runWebGPUProgram(h,[n],n.dtype,f)}var g2={kernelName:_n,backendName:"webgpu",kernelFunc:KR};var Jp=class{constructor(t,e){this.variableNames=["dy"],this.uniforms=`effectiveXSize : vec2<i32>, effectiveYSize : vec2<i32>, invHeightScale : f32, invWidthScale : f32,
       winHeight : i32, winWidth : i32,`,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.alignCorners=e,this.shaderKey=`resizeNearestNeigborBackprop_${e}`}getUserCode(){return`
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getOutputCoords();
          let b = coords[0];
          let d = coords[3];
          let r = coords[1];
          let c = coords[2];

          var accumulator = 0.0;

          // Compute bounds for where in dy we will look
          let startRLerp = floor(f32(r) * uniforms.invHeightScale);
          let startDyR = i32(floor(startRLerp - f32(uniforms.winHeight / 2)));

          let startCLerp = floor(f32(c) * uniforms.invWidthScale);
          let startDyC = i32(floor(startCLerp - f32(uniforms.winWidth / 2)));

          // Loop over dy
          for (var dyROffset = 0; dyROffset < uniforms.winHeight; dyROffset++) {
            let dyR = startDyR + dyROffset;

            // Guard against the window exceeding the bounds of dy
            if (dyR < 0 || dyR >= uniforms.dyShape[1]) {
              continue;
            }

            for (var dyCOffset = 0; dyCOffset < uniforms.winWidth; dyCOffset++) {
              let dyC = startDyC + dyCOffset;

              // Guard against the window exceeding the bounds of dy
              if (dyC < 0 || dyC >= uniforms.dyShape[2]) {
                continue;
              }

              let sourceFracRow = f32(uniforms.effectiveXSize[0]) *
                  (f32(dyR) / f32(uniforms.effectiveYSize[0]));

              let sourceFracCol = f32(uniforms.effectiveXSize[1]) *
                  (f32(dyC) / f32(uniforms.effectiveYSize[1]));

              let sourceNearestRow =
                  i32(min(f32(uniforms.outShape[1] - 1),
                  ${this.alignCorners?"floor(sourceFracRow + 0.5)":"floor(sourceFracRow)"}));

              let sourceNearestCol =
                  i32(min(f32(uniforms.outShape[2] - 1),
                  ${this.alignCorners?"floor(sourceFracCol + 0.5)":"floor(sourceFracCol)"}));

              if (r == sourceNearestRow && c == sourceNearestCol) {
                accumulator += getDy(b, dyR, dyC, d);
              }
            }
          }
          // End loop over dy

          setOutputAtIndex(index, accumulator);
        }
      }
    `}};function XR(r){let{inputs:t,backend:e,attrs:o}=r,{images:n,dy:s}=t,{alignCorners:i}=o,[,a,u]=n.shape,[,p,l]=s.shape,c=[i&&p>1?a-1:a,i&&l>1?u-1:u],m=[i&&p>1?p-1:p,i&&l>1?l-1:l],f=c[0]/m[0],h=c[1]/m[1],b=1/f,x=1/h,C=Math.ceil(b)*2+2,k=Math.ceil(x)*2+2,v=new Jp(n.shape,i),I=[{type:"int32",data:c},{type:"int32",data:m},{type:"float32",data:[b]},{type:"float32",data:[x]},{type:"int32",data:[C]},{type:"int32",data:[k]}];return e.runWebGPUProgram(v,[s],s.dtype,I)}var x2={kernelName:ka,backendName:"webgpu",kernelFunc:XR};var tl=class{constructor(t){this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms=" axis : vec4<i32>,",this.shaderKey="reverse"}getUserCode(){return`
      
      // Using uniform variables as judging conditions, so the function has
      // coherent execution within all threads.
      fn getReverseCoords(coords : vec4<i32>) -> vec4<i32> {
        var reverseCoords = coords;
        if (uniforms.axis[0] == 1) {
          reverseCoords[0] = uniforms.xShape[0] - coords[0] - 1;
        }
        if (uniforms.axis[1] == 1) {
          reverseCoords[1] = uniforms.xShape[1] - coords[1] - 1;
        }
        if (uniforms.axis[2] == 1) {
          reverseCoords[2] = uniforms.xShape[2] - coords[2] - 1;
        }
        if (uniforms.axis[3] == 1) {
          reverseCoords[3] = uniforms.xShape[3] - coords[3] - 1;
        }

        return reverseCoords;
      }
    
      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let reverseCoords = getReverseCoords(coords);
          setOutputAtIndex(index, getX(reverseCoords[0],
              reverseCoords[1], reverseCoords[2], reverseCoords[3]));
        }
      }
    `}};function jR(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{dims:s}=o,i=n.shape.length;if(i===0)return Nt({inputs:{x:n},backend:e});let a=n.shape,u=[1,1,1,1];a.forEach((x,C)=>{let k=C+4-i;u[k]=x});let p=S.parseAxisParam(s,n.shape),l=[0,0,0,0];p.forEach(x=>{let C=x+4-i;l[C]=1});let c=[{type:"int32",data:l}],m=G({inputs:{x:n},backend:e,attrs:{shape:u}}),f=new tl(u),h=e.runWebGPUProgram(f,[m],m.dtype,c);e.disposeData(m.dataId);let b=G({inputs:{x:h},backend:e,attrs:{shape:a}});return e.disposeData(h.dataId),b}var y2={kernelName:Ln,backendName:"webgpu",kernelFunc:jR};var el=class{constructor(t,e){this.outputShape=[],this.variableNames=["x"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms=`centerX : f32, centerY : f32, sinRadians : f32,
          cosRadians : f32,`,this.shaderKey="rotate",this.outputShape=t,typeof e=="number"?(this.uniforms+=" fillValue : f32,",this.fillSnippet="var outputValue = uniforms.fillValue;",this.shaderKey+="_float"):(this.uniforms+=" fillValue : vec3<f32>,",this.fillSnippet="var outputValue = uniforms.fillValue[coords[3]];",this.shaderKey+="_vec3")}getUserCode(){return`
        ${D("index")} {
          if (index < uniforms.size) {
            let coords = getCoordsFromIndex(index);
            let coordXFloat = (f32(coords[2]) - uniforms.centerX) *
                uniforms.cosRadians - (f32(coords[1]) - uniforms.centerY) *
                uniforms.sinRadians;
            let coordYFloat = (f32(coords[2]) - uniforms.centerX) *
                uniforms.sinRadians + (f32(coords[1]) - uniforms.centerY) *
                uniforms.cosRadians;
            let coordX = i32(round(coordXFloat + uniforms.centerX));
            let coordY = i32(round(coordYFloat + uniforms.centerY));
            ${this.fillSnippet}
            if(coordX >= 0 && coordX < uniforms.xShape[2] && coordY >= 0 &&
                coordY < uniforms.xShape[1]) {
              outputValue = getX(coords[0], coordY, coordX, coords[3]);
            }
            setOutputAtIndex(index, outputValue);
          }
        }
      `}};var b2={kernelName:Oa,backendName:"webgpu",kernelFunc:({inputs:r,attrs:t,backend:e})=>{let{image:o}=r,{radians:n,fillValue:s,center:i}=t,a=e,u=new el(o.shape,s),[p,l]=N.getImageCenter(i,o.shape[1],o.shape[2]),c=[{type:"float32",data:[p]},{type:"float32",data:[l]},{type:"float32",data:[Math.sin(n)]},{type:"float32",data:[Math.cos(n)]}];return typeof s=="number"?c.push({type:"float32",data:[Number.parseFloat(s.toFixed(2))]}):c.push({type:"float32",data:s}),a.runWebGPUProgram(u,[o],o.dtype,c)}};var YR=j({opType:P.ROUND}),w2={kernelName:Gn,backendName:"webgpu",kernelFunc:YR};var ZR=j({opType:P.RSQRT,cpuKernelImpl:Gb}),S2={kernelName:Pr,backendName:"webgpu",kernelFunc:ZR};var sr=class{constructor(t,e,o,n,s,i,a,u=!0){this.variableNames=["updates","indices"],this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=i,this.type=a,this.sumDupeIndices=u,this.dispatchLayout=F(t),this.dispatch=A(this.dispatchLayout,t,this.workgroupSize),this.sliceDimGreaterThanOne=e>1,this.shaderKey=`scatter_${o}_${n}_${this.sliceDimGreaterThanOne}_${a}_${u}_${s.length}`;let p=ht(s.length);this.uniforms=`sliceDim : i32, strides: ${p}, updatesSize: i32,`,this.updatesRank=n,this.indicesRank=o}getUserCode(){let t="";this.indicesRank===1?t="coords[0]":this.indicesRank===2&&(t="coords[0], j");let e=`getIndices(${t})`,o=this.sliceDimGreaterThanOne?"uniforms.strides[j]":"uniforms.strides",n="",s="";this.dispatchLayout.x.length===1?(n="flattenedIndex",s=`
      fn getUpdatesCoordsFromFlatIndex(index : i32) -> i32 {
        return index;
      }
      `):this.dispatchLayout.x.length===2&&(n="vec2<i32>(flattenedIndex, coords[1])",s=`
      fn getUpdatesCoordsFromFlatIndex(index : i32) -> vec2<i32> {
        // N.B. |updates| could be a scalar tensor, conceptually representing a
        // 2D tensor with all values equal to that. By design, its size must be
        // the same as |outShape[1]| in one dimension, and |indicesShape[0]|
        // gives the other.
        let sliceSize = uniforms.outShape[1];
        let d0 = index / sliceSize;
        let d1 = index - d0 * sliceSize;
        return vec2<i32>(d0, d1);
      }
      `);let a=`getUpdates(${Array.from({length:this.updatesRank},(p,l)=>`coords[${l}]`).join(", ")})`;return`
    ${s}
      ${D("index")} {
        if (index < uniforms.updatesSize) {
          let coords = getUpdatesCoordsFromFlatIndex(index);
          var flattenedIndex = 0;
          for (var j = 0; j < uniforms.sliceDim; j = j + 1) {
            let indexInside = i32(round(${e}));
            flattenedIndex = flattenedIndex + indexInside * ${o};
          }
          let updateValue =
              ${qr(this.type)}(${a});
          let flatIndex = getOutputIndexFromCoords(${n});

          ${this.sumDupeIndices?pe("&result[flatIndex]","updateValue",this.type):"atomicStore(&result[flatIndex], bitcast<i32>(updateValue));"}
        }
      }`}};function QR(r){let{inputs:t,backend:e,attrs:o}=r,{indices:n,updates:s}=t,{shape:i}=o,{sliceRank:a,numUpdates:u,sliceSize:p,strides:l,outputSize:c}=N.calculateShapes(s,n,i),m=[c/p,p];if(c===0)return e.makeTensorInfo(i,n.dtype);let f=G({inputs:{x:n},backend:e,attrs:{shape:[u,a]}}),h=G({inputs:{x:s},backend:e,attrs:{shape:[u,p]}}),b=h.dtype,x=Ct({backend:e,attrs:{shape:m,value:0,dtype:b}}),C=S.sizeFromShape(h.shape),k=[{type:"int32",data:[a]},{type:"int32",data:l},{type:"int32",data:[C]}],v=new sr(h.shape,a,f.shape.length,h.shape.length,l,m,b),I=e.runWebGPUProgram(v,[h,f],b,k,x),T=G({inputs:{x:I},backend:e,attrs:{shape:i}});return e.disposeData(f.dataId),e.disposeData(h.dataId),e.disposeData(I.dataId),T}var C2={kernelName:Ea,backendName:"webgpu",kernelFunc:QR};var rl=class{constructor(t,e){this.outputShape=[],this.variableNames=["sortedSequence","values"],this.uniforms="numInputs : i32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.side=e,this.shaderKey=`search_sorted_${e}`}getUserCode(){return`
      fn findBound(batch: i32, value: f32) -> i32 {
        var left = i32(0);
        var right = uniforms.numInputs;
        while (left < right) {
          var mid = (left + right) / 2;
          if (getSortedSequence(batch, mid) ${this.side==="left"?"<":"<="} value) {
            left = mid + 1;
          } else {
            right = mid;
          }
        }
        return right;
      }

      ${D("index")} {
        if (index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let value = getValuesByOutputIndex(index);
          setOutputAtIndexI32(index, findBound(coords[0], value));
        }
      }
    `}};function JR(r){let{inputs:t,backend:e,attrs:o}=r,{sortedSequence:n,values:s}=t,{side:i}=o,a=new rl([s.shape[0],s.shape[1]],i),u=[{type:"int32",data:[n.shape[1]]}];return e.runWebGPUProgram(a,[n,s],"int32",u)}var v2={kernelName:Na,backendName:"webgpu",kernelFunc:JR};var ol=class{constructor(t,e,o){this.variableNames=["c","a","b"],this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=e,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.cRank=t,this.rank=o,this.shaderKey="select"}getUserCode(){let t,e;if(this.rank>4)throw Error(`Where for rank ${this.rank} is not yet supported`);if(this.rank===1)e="resRC",t="resRC";else{let n=["resRC.x","resRC.y","resRC.z","resRC.w"],s=[],i=[];for(let a=0;a<this.outputShape.length;a++)i.push(`${n[a]}`),a<this.cRank&&s.push(`${n[a]}`);t=s.join(),e=i.join()}return`
      ${D("index")} {
        if (index < uniforms.size) {
          let resRC = getCoordsFromIndex(index);
          let cVal = getC(${t});
          if (cVal >= 1.0) {
            setOutputAtIndex(index, getA(${e}));
          } else {
            setOutputAtIndex(index, getB(${e}));
          }
        }
      }
    `}};function tF(r){let{inputs:t,backend:e}=r,{condition:o,t:n,e:s}=t,i=new ol(o.shape.length,n.shape,n.shape.length);return e.runWebGPUProgram(i,[o,n,s],qt(n.dtype,s.dtype))}var k2={kernelName:On,backendName:"webgpu",kernelFunc:tF};var eF=j({opType:P.SELU}),I2={kernelName:Wn,backendName:"webgpu",kernelFunc:eF};var rF=j({opType:P.SIGMOID}),E2={kernelName:Mr,backendName:"webgpu",kernelFunc:rF};var oF=j({opType:P.SIGN}),$2={kernelName:Vn,backendName:"webgpu",kernelFunc:oF};var nF=j({opType:P.SIN}),N2={kernelName:"Sin",backendName:"webgpu",kernelFunc:nF};var sF=j({opType:P.SINH}),T2={kernelName:Un,backendName:"webgpu",kernelFunc:sF};var iF=j({opType:P.SOFTPLUS}),D2={kernelName:Hn,backendName:"webgpu",kernelFunc:iF};var nl=class{constructor(t,e,o,n,s,i){this.variableNames=["x"],this.outputShape=[],this.uniforms="",this.workgroupSize=[64,1,1],this.size=!0;let a=new Array(n.length);for(let u=0;u<a.length;u++)a[u]=n[s[u]];this.outputShape=a,this.newDim=s,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.xShape=t,this.paddedXShape=e,this.uniforms+=`reshapedPaddedXShape : ${ht(n.length)}, paddedXShapeStrides : ${ht(i)}, `,o.map((u,p)=>{this.uniforms+=` pad${p} : vec2<i32>,`}),this.shaderKey=`spaceToBatchND_${s}`}getUserCode(){let t=ht(this.outputShape.length),e=Wm(this.newDim);return`
      ${ki(this.paddedXShape,"PaddedX")}
      ${D("index")} {
        if(index < uniforms.size) {
          let coords = getCoordsFromIndex(index);
          let switchedIndex = getIndexFromCoords${this.outputShape.length}D(${t}(${e}), uniforms.reshapedPaddedXShape);
          let paddedCoords = getPaddedXCoordsFromIndex(switchedIndex);
          ${tf(this.xShape,!0)}
        }
      }
    `}};var aF=r=>{let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{blockShape:s,paddings:i}=o;S.assert(n.shape.length<=4,()=>"spaceToBatchND for rank > 4 with a WebGPU backend not implemented yet");let a=s.reduce((k,v)=>k*v),u=[[0,0]];u.push(...i);for(let k=1+s.length;k<n.shape.length;++k)u.push([0,0]);let p=u.map((k,v)=>k[0]+n.shape[v]+k[1]),l=N.getReshaped(p,s,a,!1),c=N.getPermuted(l.length,s.length,!1),m=N.getReshapedPermuted(p,s,a,!1),f=S.computeStrides(p),h=new nl(n.shape,p,u,l,c,f.length),b=[{type:"int32",data:l},{type:"int32",data:f}];u.map(k=>b.push({type:"int32",data:[k[0],k[1]]}));let x=e.runWebGPUProgram(h,[n],n.dtype,b),C=G({inputs:{x},backend:e,attrs:{shape:m}});return e.disposeData(x.dataId),C},A2={kernelName:qn,backendName:"webgpu",kernelFunc:aF};var sl=class{constructor(t,e,o){this.variableNames=["input","indices","segmentIds"],this.outputShape=[],this.uniforms="segmentSize : i32, sparseSize : i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=t,this.type=o,this.dispatchLayout=F([e]),this.dispatch=A(this.dispatchLayout,[e],this.workgroupSize),this.shaderKey="sparseSegmentSum"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.sparseSize) {
        let indexInSegmentIds = index / uniforms.segmentSize;
        let indexInSegment = index % uniforms.segmentSize;
        let indexInInput = indices[indexInSegmentIds];
        let segmentId = segmentIds[indexInSegmentIds];

        let value = input[indexInInput * uniforms.segmentSize + indexInSegment];
        let outIndex = segmentId * uniforms.segmentSize + indexInSegment;
        ${pe("&result[outIndex]","value",this.type)}
      }
    }
  `}},il=class{constructor(t,e){this.variableNames=["segmentIds"],this.outputShape=[],this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=[t],this.dispatchLayout=F(e),this.dispatch=A(this.dispatchLayout,e,this.workgroupSize),this.shaderKey="sparseSegmentIdCountProgram"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.segmentIdsShape) {
        let segmentId = segmentIds[index];
        ${pe("&result[segmentId]","1","int32")}
      }
    }
  `}},al=class{constructor(t,e){this.variableNames=["segmentSum","sameSegmentIdCount"],this.outputShape=[],this.uniforms="segmentSize : i32",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.type=e,this.dispatchLayout=F(t),this.dispatch=A(this.dispatchLayout,t,this.workgroupSize),this.shaderKey="sparseSegmentMean"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.size) {
        let segmentId = index / uniforms.segmentSize;
        let count = sameSegmentIdCount[segmentId];
        if (count != 0) {
          ${this.type==="float32"?"setOutputAtIndex(index, segmentSum[index] / f32(count));":"setOutputAtIndexI32(index, segmentSum[index] / count);"}
        }
      }
    }
  `}};function ul(r,t,e,o=!1,n){let i=S.sizeFromShape(r.shape)/r.shape[0],a=r.dtype,u=S.sizeFromShape(t.shape),p=n.readSync(e.dataId),c=u>0?p[u-1]+1:0,m,f=r.shape.slice();f[0]=c;let h=u*i,b=Ct({backend:n,attrs:{shape:f,value:0,dtype:a}});m=new sl(f,h,a);let x=[{type:"int32",data:[i]},{type:"int32",data:[h]}],C=n.runWebGPUProgram(m,[r,t,e],a,x,b);if(o)return C;let k=Ct({backend:n,attrs:{shape:[c],value:0,dtype:"int32"}});m=new il(c,e.shape);let v=n.runWebGPUProgram(m,[e],"int32",null,k),I=Ct({backend:n,attrs:{shape:f,value:0,dtype:a}});m=new al(f,a),x=[{type:"int32",data:[i]}];let T=n.runWebGPUProgram(m,[C,v],a,x,I);return n.disposeData(C.dataId),n.disposeData(v.dataId),T}function uF(r){let{inputs:t,backend:e}=r,{data:o,indices:n,segmentIds:s}=t;return ul(o,n,s,!1,e)}var R2={kernelName:Aa,backendName:"webgpu",kernelFunc:uF};function pF(r){let{inputs:t,backend:e}=r,{data:o,indices:n,segmentIds:s}=t;return ul(o,n,s,!0,e)}var F2={kernelName:Ra,backendName:"webgpu",kernelFunc:pF};var pl=class{constructor(t,e){this.variableNames=["A"],this.workgroupSize=[64,1,1],this.size=!0;let o=new Array(t.length);for(let n=0;n<o.length;n++)o[n]=t[n]*e[n];this.outputShape=o,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.rank=this.outputShape.length,this.shaderKey="tile"}getUserCode(){let t=lF(this.rank,"uniforms.");return`
      ${D("index")} {
        if (index < uniforms.size) {
          let resRC = getCoordsFromIndex(index);
          setOutputAtIndex(index, getA(${t}));
        }
      }
    `}};function lF(r,t=""){if(r>=5)throw Error(`Tile for rank ${r} is not yet supported`);if(r===1)return`(resRC % ${t}aShape)`;let e=["resRC.x","resRC.y","resRC.z","resRC.w"],o=[];for(let n=0;n<r;n++)o.push(`(${e[n]} % ${t}aShape[${n}])`);return o.join()}function Fi(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{reps:s}=o;if(e.shouldExecuteOnCPU([n])||n.dtype==="string"||n.shape.length>=5){let u=e.readSync(n.dataId),p=n.dtype==="string"?u.map(m=>S.decodeString(m)):u,l=st(n.shape,n.dtype,p),c=Kb(l,s);return e.makeTensorInfo(c.shape,c.dtype,c.values)}let i=new pl(n.shape,s);return e.runWebGPUProgram(i,[n],n.dtype)}var P2={kernelName:zr,backendName:"webgpu",kernelFunc:Fi};function cF(r){let{inputs:t,backend:e,attrs:o}=r,{sparseIndices:n,sparseValues:s,defaultValue:i}=t,{outputShape:a}=o,{sliceRank:u,numUpdates:p,sliceSize:l,strides:c,outputSize:m}=N.calculateShapes(s,n,a),f=!1;if(s.dtype==="string"){let z=e.bufferSync(n),B=e.bufferSync(s),H=S.decodeString(e.readSync(i.dataId)[0]),Y=Ob(z,B,a,m,l,p,u,c,H,f);return e.makeTensorInfo(a,Y.dtype,Y.values)}let h=[m/l,l],b=G({inputs:{x:n},backend:e,attrs:{shape:[p,u]}}),x=s.shape.length?G({inputs:{x:s},backend:e,attrs:{shape:[p,l]}}):Nt({inputs:{x:s},backend:e}),C=x.dtype,k=e.makeTensorInfo([],C,S.makeZerosTypedArray(1,C)),v=G({inputs:{x:i},backend:e,attrs:{shape:Array(h.length).fill(1)}}),I=Fi({inputs:{x:v},backend:e,attrs:{reps:h}}),T=S.sizeFromShape([p,l]),R=[{type:"int32",data:[u]},{type:"int32",data:c},{type:"int32",data:[T]}];switch(p){case 0:break;case 1:{let z=new sr([p,l],u,b.shape.length,x.shape.length,c,h,C,f);e.runWebGPUProgram(z,[x,b],C,R,I)}break;default:{let z=new sr([p,l],u,b.shape.length,k.shape.length,c,h,C,f);e.runWebGPUProgram(z,[k,b],C,R,I)}{let z=new sr([p,l],u,b.shape.length,x.shape.length,c,h,C);e.runWebGPUProgram(z,[x,b],C,R,I)}}let M=G({inputs:{x:I},backend:e,attrs:{shape:a}});return e.disposeData(b.dataId),e.disposeData(x.dataId),e.disposeData(v.dataId),e.disposeData(k.dataId),e.disposeData(I.dataId),M}var M2={kernelName:Fa,backendName:"webgpu",kernelFunc:cF};function mF(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{numOrSizeSplits:s,axis:i}=o,a=S.parseAxisParam(i,n.shape)[0],u=N.prepareSplitSize(n,s,a),p=n.shape.length,l=new Array(p).fill(0),c=n.shape.slice();return u.map(m=>{let f=[...c];f[a]=m;let h=qe({inputs:{x:n},backend:e,attrs:{begin:l,size:f}});return l[a]+=m,h})}var _2={kernelName:Kn,backendName:"webgpu",kernelFunc:mF};var fF=j({opType:P.SQRT}),B2={kernelName:_r,backendName:"webgpu",kernelFunc:fF};var z2={kernelName:Pa,backendName:"webgpu",kernelFunc:({inputs:r,backend:t})=>{let{x:e}=r,o=t,n=new ce(e.shape,P.SQUARE);return o.runWebGPUProgram(n,[e],e.dtype)}};var dF=ct({opType:q.SQUARED_DIFFERENCE}),L2={kernelName:Br,backendName:"webgpu",kernelFunc:dF};function hF({inputs:r,attrs:t,backend:e}){let{x:o}=r,n=new ce(o.shape,P.STEP,"stepAlpha : f32,"),s=[{type:"float32",data:[t.alpha]}];return e.runWebGPUProgram(n,[o],o.dtype,s)}var G2={kernelName:ts,backendName:"webgpu",kernelFunc:hF};var ll=class{constructor(t){this.variableNames=["x"],this.workPerThread=1,this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize,[this.workPerThread,1,1]);let e=ht(this.outputShape.length);this.uniforms=`begin : ${e},  strides : ${e}, `,this.shaderKey="stridedSlice"}getUserCode(){let t=this.outputShape.length,e="";if(t===1)e="coords * uniforms.strides + uniforms.begin";else{let n=0;e=this.outputShape.map((s,i)=>(n++,this.outputShape.length===1?`coords * uniforms.strides[${i}] + uniforms.begin[${i}]`:`coords[${n-1}] * uniforms.strides[${i}] + uniforms.begin[${i}]`)).join(",")}return`
       ${D("index")} {
         if (index < uniforms.size) {
           let coords = getCoordsFromIndex(index);
           setOutputAtIndex(index, getX(${e}));
         }
       }
     `}};function gF(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{begin:s,end:i,strides:a,beginMask:u,endMask:p,ellipsisMask:l,newAxisMask:c,shrinkAxisMask:m}=o,{finalShapeSparse:f,finalShape:h,isIdentity:b,sliceDim0:x,isSimpleSlice:C,begin:k,end:v,strides:I}=be.sliceInfo(n.shape,s,i,a,u,p,l,c,m),T;if(b)T=G({inputs:{x:n},backend:e,attrs:{shape:h}});else if(x||C){S.assert(n.shape.length>=1,()=>`Input must have rank at least 1, got: ${n.shape.length}`);let R=be.computeOutShape(k,v,I),M=qe({inputs:{x:n},backend:e,attrs:{begin:k,size:R}});T=G({inputs:{x:M},backend:e,attrs:{shape:h}}),e.disposeData(M.dataId)}else if(e.shouldExecuteOnCPU([n])){let M=e.readSync(n.dataId),z=st(n.shape,n.dtype,M),B=Vb(f,z,I,k);T=e.makeTensorInfo(h,n.dtype,B.values)}else{let M=new ll(f),z=[{type:"int32",data:k},{type:"int32",data:I}],B=e.runWebGPUProgram(M,[n],n.dtype,z);T=G({inputs:{x:B},backend:e,attrs:{shape:h}}),e.disposeData(B.dataId)}return T}var O2={kernelName:_a,backendName:"webgpu",kernelFunc:gF};function xF(r){let{inputs:t,backend:e,attrs:o}=r,{separator:n,nGramWidths:s,leftPad:i,rightPad:a,padWidth:u,preserveShortSequences:p}=o,{data:l,dataSplits:c}=t,m=e.readSync(l.dataId),f=e.readSync(c.dataId),[h,b]=Hb(m,f,n,s,i,a,u,p);return[e.makeTensorInfo([h.length],"string",h),e.makeTensorInfo(c.shape,"int32",b)]}var W2={kernelName:Ba,backendName:"webgpu",kernelFunc:xF};var yF=ct({opType:q.SUB,cpuKernelImpl:qb,supportsComplex:!0}),U2={kernelName:"Sub",backendName:"webgpu",kernelFunc:yF};var bF=j({opType:P.TAN}),V2={kernelName:"Tan",backendName:"webgpu",kernelFunc:bF};var wF=j({opType:P.TANH}),H2={kernelName:Yn,backendName:"webgpu",kernelFunc:wF};function SF(r){let{inputs:t,backend:e,attrs:o}=r,{tensor:n,indices:s,updates:i}=t,{}=o,{sliceRank:a,numUpdates:u,sliceSize:p,strides:l,outputSize:c}=N.calculateShapes(i,s,n.shape),m=[c/p,p];if(c===0)return e.makeTensorInfo(n.shape,s.dtype);let f=[],h=G({inputs:{x:s},backend:e,attrs:{shape:[u,a]}});f.push(h);let b=G({inputs:{x:i},backend:e,attrs:{shape:[u,p]}});f.push(b);let x=G({inputs:{x:n},backend:e,attrs:{shape:m}});f.push(x);let C=Fi({inputs:{x},backend:e,attrs:{reps:Array(m.length).fill(1)}}),k=new sr([u,p],a,h.shape.length,b.shape.length,l,m,n.dtype,!1),v=S.sizeFromShape([u,p]),I=[{type:"int32",data:[a]},{type:"int32",data:l},{type:"int32",data:[v]}],T=e.runWebGPUProgram(k,[b,h],x.dtype,I,C);f.push(T);let R=G({inputs:{x:T},backend:e,attrs:{shape:n.shape}});return f.forEach(M=>e.disposeData(M.dataId)),R}var q2={kernelName:$a,backendName:"webgpu",kernelFunc:SF};var cl=class{constructor(t){this.variableNames=["x","indices"],this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms=`inputSize : i32, firstPass : i32, negativeInf : f32,
        dir : i32, inc : i32,`,this.shaderKey="swap"}getUserCode(){return`
        ${D("index")} {
          if (index < uniforms.size) {
            let outC = getCoordsFromIndex(index);
            let batch = outC[0];
            let elemIdx = outC[1];
            // We compare elements pair-wise within a group of size 2 * inc.
            // The comparing rule for each group alternates between ascending
            // and descending. Within each group, we compare each pair at
            // positions i and i+inc. To decide whether an element at position i
            // is x0 or x1, we mod it by 2 * inc, if the result is smaller than
            // inc, it is in the first half of the group, we denote it as x0,
            // otherwise we denote it as x1.
            // For example, as shown in the Bitonic top K paper referenced
            // above, Figure5(a) shows that element[1] is in the second half of
            // the group when group size is 2, but it is in the first half of
            // the group when group size is 4.
            let isFirstInPair = elemIdx % (2 * uniforms.inc) < uniforms.inc;
            var i = 0;
            if (isFirstInPair) {
              i = elemIdx;
            } else {
              i = elemIdx - uniforms.inc;
            }

            var i0 = 0;
            if (uniforms.firstPass == 1) {
              i0 = i;
            } else {
              i0 = i32(getIndices(batch, i));
            }

            var i1 = 0;
            if (uniforms.firstPass == 1) {
              i1 = i + uniforms.inc;
            } else {
              i1 = i32(getIndices(batch, i + uniforms.inc));
            }

            var x0 = f32(0.0);
            var x1 = f32(0.0);
            if (i0 < uniforms.inputSize) {
              x0 = getX(batch, i0);
            } else {
              x0 = uniforms.negativeInf;
            }
            if (i1 < uniforms.inputSize) {
              x1 = getX(batch, i1);
            } else {
              x1 = uniforms.negativeInf;
            }

            let reverse = elemIdx % (2 * uniforms.dir) >= uniforms.dir;
            let isGreater = x0 > x1 || (x0 == x1 && i1 > i0);
            if (reverse == isGreater) {
              // Elements in opposite order of direction
              let iTemp = i0;
              i0 = i1;
              i1 = iTemp;
            }
            if (isFirstInPair) {
              setOutputAtIndex(index, f32(i0));
            } else {
              setOutputAtIndex(index, f32(i1));
            }
          }
        }
      `}},ml=class{constructor(t){this.variableNames=["x","indices"],this.workgroupSize=[256,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.uniforms="inputSize : i32, firstPass : i32, k : i32,",this.shaderKey="merge"}getUserCode(){return`
        ${D("index")} {
          if (index < uniforms.size) {
            let outC = getCoordsFromIndex(index);
            let batch = outC[0];
            let elemIdx = outC[1];
            // The output size is half of the previous size.
            // If the previous sequence is | | | | _ _ _ _  | | | |  _ _ _ _
            // (k=4), we only need to output the indices at positions |, the
            // indices at positions _ can be thrown away, see Figure5(b) After
            // Phase 2 (Merge phase) in the Bitonic Top K paper referenced
            // above.
            // For example, the paper shows we only need to output the orange
            // bars. The output sequence should look like this | | | | | | | |.
            // Because the sequence is halved, to map the output index back to
            // the previous sequence to find the corresponding value, we need
            // to double the index. When we double the index, we basically
            // interpolate a position, so 2i looks like
            // | _ | _ | _ | _ | _ | _ | _. We move the | to the first k
            // position of each 2k positions by - elemIdx % k. E.g. for output
            // at index 4,5,6,7, we want to get the corresponding element at
            // original index 8,9,10,11, for output at index 8,9,10,11,
            // we want to get the corresponding element at original index
            // 16,17,18,19, so on and so forth.

            var i = 0;
            if (elemIdx < uniforms.k) {
              i = elemIdx;
            } else {
              i = elemIdx * 2 - elemIdx % uniforms.k;
            }
            var i0 = 0;
            if (uniforms.firstPass == 1) {
              i0 = i;
            } else {
              i0 = i32(getIndices(batch, i));
            }
            var i1 = 0;
            if (uniforms.firstPass == 1) {
              i1 = i + uniforms.k;
            } else {
              i1 = i32(getIndices(batch, i + uniforms.k));
            }

            let x0 = getX(batch, i0);
            var x1 = f32(0.0);
            if (i1 < uniforms.inputSize) {
              x1 = getX(batch, i1);
            } else {
              x1 = x0;
            }

            if (x0 >= x1) {
              setOutputAtIndex(index, f32(i0));
            } else {
              setOutputAtIndex(index, f32(i1));
            }
          }
        }
      `}};function _s(r,t){t!==null&&r.disposeData(t.dataId)}function K2(r){let t=1;for(;t<r;)t*=2;return t}function CF(r){let{inputs:t,backend:e,attrs:o}=r,{x:n}=t,{k:s,sorted:i}=o,a=n.shape,u=a[a.length-1];if(e.shouldExecuteOnCPU([n])){let T=e.readSync(n.dataId),[R,M]=Xb(T,a,n.dtype,s,i);return[e.makeTensorInfo(R.shape,R.dtype,R.values),e.makeTensorInfo(M.shape,M.dtype,M.values)]}if(s===0)return a[a.length-1]=0,[e.makeTensorInfo(a,n.dtype,[]),e.makeTensorInfo(a,"int32",[])];if(u===1)return[n,Ct({attrs:{shape:a,dtype:"int32",value:0},backend:e})];let l=S.sizeFromShape(a)/u,c=G({inputs:{x:n},attrs:{shape:[l,u]},backend:e}),m=K2(s),f=K2(u),h=null,b=()=>h===null?[c,c]:[c,h],x=(T,R,M)=>{let z=b(),B=new cl(M),Y=[{type:"int32",data:[u]},{type:"int32",data:[h===null?1:0]},{type:"float32",data:[Number.NEGATIVE_INFINITY]},{type:"int32",data:[T]},{type:"int32",data:[R]}],J=h;h=e.runWebGPUProgram(B,z,"int32",Y),_s(e,J)};for(let T=1;T<m;T*=2){let R=T*2;for(let M=T;M>=1;M/=2)x(R,M,[l,f])}for(let T=f;T>m;T/=2){let R=b(),M=new ml([l,T/2]),B=[{type:"int32",data:[u]},{type:"int32",data:[h===null?1:0]},{type:"int32",data:[m]}],H=h;h=e.runWebGPUProgram(M,R,"int32",B),_s(e,H);let Y=m/2,J=Y*2;for(let it=Y;it>=1;it/=2)x(J,it,h.shape)}let C=h;h=qe({inputs:{x:h},backend:e,attrs:{begin:0,size:[l,s]}}),_s(e,C);let k=Qm({inputs:{x:c,indices:h},backend:e,attrs:{axis:1,batchDims:1}});_s(e,c);let v=a.slice(0,-1);v.push(s),C=h,h=G({inputs:{x:h},attrs:{shape:v},backend:e}),_s(e,C);let I=k;return k=G({inputs:{x:k},attrs:{shape:v},backend:e}),_s(e,I),[k,h]}var X2={kernelName:La,backendName:"webgpu",kernelFunc:CF};var fl=class{constructor(t){this.variableNames=["Image","Transforms"],this.uniforms="interpolationModeId : i32, fillModeId : i32, fillValue : f32,",this.workgroupSize=[64,1,1],this.size=!0,this.outputShape=t,this.dispatchLayout=F(this.outputShape),this.dispatch=A(this.dispatchLayout,this.outputShape,this.workgroupSize),this.shaderKey="transform"}getUserCode(){return`
          fn mapCoord(outCoord : f32, len : f32) -> f32{
            var inCoord = outCoord;
            if(uniforms.fillModeId == 2) {
              if (inCoord < 0.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz2 = 2.0 * len;
                  if (inCoord < sz2) {
                    inCoord = sz2 * f32(i32(f32(-inCoord / sz2))) +
                    inCoord;
                  }
                  if (inCoord < -len) {
                    inCoord = inCoord + sz2;
                  } else {
                    inCoord = -inCoord - 1.0;
                  }
                }
              } else if (inCoord > len - 1.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz2 = 2.0 * len;
                  inCoord = inCoord - sz2 * f32(i32(f32(inCoord / sz2)));
                  if (inCoord >= len) {
                    inCoord = sz2 - inCoord - 1.0;
                  }
                }
              }
              return clamp(inCoord, 0.0, len - 1.0);
            } else if (uniforms.fillModeId == 3) {
              if (inCoord < 0.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz = len - 1.0;
                  inCoord = inCoord + len * (f32(i32(f32(-inCoord / sz))) + 1.0);
                }
              } else if (inCoord > len - 1.0) {
                if (len <= 1.0) {
                  inCoord = 0.0;
                } else {
                  let sz = len - 1.0;
                  inCoord = inCoord - len * f32(i32(f32(inCoord / sz)));
                }
              }
              return clamp(inCoord, 0.0, len - 1.0);
            } else if (uniforms.fillModeId == 4) {
              return clamp(outCoord, 0.0, len - 1.0);
            }
            return outCoord;
          }
          fn readWithFillValue(batch : i32, coordY : i32, coordX : i32,
            channel : i32) -> f32 {
            var outputValue : f32;
            if (0 <= coordY && coordY < uniforms.imageShape[1] && 0 <= coordX && coordX < uniforms.imageShape[2]) {
                outputValue = getImage(batch, coordY, coordX, channel);
            } else {
              outputValue = uniforms.fillValue;
            }
            return outputValue;
          }

          ${D("index")} {
            if (index < uniforms.size) {
              let coords = getCoordsFromIndex(index);
              var outputValue : f32;
              let batch = coords[0];
              let x = coords[2];
              let y = coords[1];
              let channel = coords[3];
              let xf = f32(x);
              let yf = f32(y);
              let a1 = getTransforms(batch, 0);
              let a2 = getTransforms(batch, 1);
              let a3 = getTransforms(batch, 2);
              let b1 = getTransforms(batch, 3);
              let b2 = getTransforms(batch, 4);
              let b3 = getTransforms(batch, 5);
              let c1 = getTransforms(batch, 6);
              let c2 = getTransforms(batch, 7);
              let projection = c1 * xf + c2 * yf + 1.0;
              if (projection == 0.0) {
                outputValue = uniforms.fillValue;
              } else {
                let inX = (a1 * xf + a2 * yf + a3) / projection;
                let inY = (b1 * xf + b2 * yf + b3) / projection;
                let mapX = mapCoord(inX, f32(uniforms.imageShape[2]));
                let mapY = mapCoord(inY, f32(uniforms.imageShape[1]));

                if (uniforms.interpolationModeId == 1) {
                  let coordY = i32(round(mapY));
                  let coordX = i32(round(mapX));
                  outputValue = readWithFillValue(batch, coordY, coordX,
                    channel);
                } else {
                  let yFloor = floor(mapY);
                  let xFloor = floor(mapX);
                  let yCeil = yFloor + 1.0;
                  let xCeil = xFloor + 1.0;
                  let valueYFloor = (xCeil - mapX) *
                  readWithFillValue(batch, i32(yFloor), i32(xFloor), channel) +
                  (mapX - xFloor) *
                  readWithFillValue(batch, i32(yFloor), i32(xCeil), channel);
                  let valueYCeil = (xCeil - mapX) *
                  readWithFillValue(batch, i32(yCeil), i32(xFloor), channel) +
                  (mapX - xFloor) *
                  readWithFillValue(batch, i32(yCeil), i32(xCeil), channel);
                  outputValue = (yCeil - mapY) * valueYFloor +
                  (mapY - yFloor) * valueYCeil;
                }
              }
              setOutputAtIndex(index, outputValue);
            }
          }
        `}};function vF(r){let{inputs:t,backend:e,attrs:o}=r,{image:n,transforms:s}=t,{interpolation:i,fillMode:a,fillValue:u,outputShape:p}=o,[l,c,m,f]=n.shape,[h,b]=p??[c,m],x=[l,h,b,f],C=new fl(x),k=i==="nearest"?1:2,v;switch(a){case"constant":v=1;break;case"reflect":v=2;break;case"wrap":v=3;break;case"nearest":v=4;break;default:v=1;break}let I=[{type:"int32",data:[k]},{type:"int32",data:[v]},{type:"float32",data:[u]}];return e.runWebGPUProgram(C,[n,s],"float32",I)}var j2={kernelName:Ga,backendName:"webgpu",kernelFunc:vF};function kF(r){let{inputs:t,backend:e,attrs:o}=r,{value:n}=t,{axis:s}=o;s<0&&(s+=n.shape.length);let i=n,a=i.shape.length,u=n.shape[s],p=new Array(a-1),l=0;for(let b=0;b<a;b++)b!==s&&(p[l++]=i.shape[b]);let c=[],m=new Array(a).fill(0),f=i.shape.slice();f[s]=1;let h=new Array(u);for(let b=0;b<h.length;b++){m[s]=b;let x=qe({inputs:{x:i},backend:e,attrs:{begin:m,size:f}}),C=G({inputs:{x},backend:e,attrs:{shape:p}});h[b]=C,c.push(x)}return c.forEach(b=>e.disposeData(b.dataId)),h}var Y2={kernelName:Zn,backendName:"webgpu",kernelFunc:kF};var dl=class{constructor(t,e,o){if(this.outputShape=[],this.variableNames=["x","segmentIds"],this.uniforms="numSegments : i32, xSize: i32,",this.workgroupSize=[64,1,1],this.atomic=!0,this.outputShape=e,this.dispatchLayout=F(t),this.dispatch=A(this.dispatchLayout,t,this.workgroupSize),o!=="float32"&&o!=="int32")throw new Error(`UnsortedSegmentSum only supports float32 and int32
              types, does not support ${o} type.`);this.type=o,this.shaderKey="unsortedSegmentSum"}getUserCode(){return`
    ${D("index")} {
      if (index < uniforms.xSize) {
        let coords = getXCoordsFromIndex(index);
        let b = coords[0];
        let inCol = coords[1];

        let segmentId = i32(getSegmentIds(inCol));
        if (segmentId >= 0) {
          let flatIndex = b * uniforms.numSegments + segmentId % uniforms.numSegments;
          let value = getX(b, inCol);

          ${pe("&result[flatIndex]","value",this.type)}
        }
      }
    }
  `}};function IF(r){let{inputs:t,backend:e,attrs:o}=r,{x:n,segmentIds:s}=t,{numSegments:i}=o,a=n.shape.length,u=[],p=0,l=N.getAxesPermutation([p],a),c=n;l!=null&&(c=Kt({inputs:{x:n},backend:e,attrs:{perm:l}}),u.push(c),p=N.getInnerMostAxes(1,a)[0]);let m=N.segment_util.computeOutShape(c.shape,p,i),f=S.sizeFromShape([c.shape[p]]),h=G({inputs:{x:c},backend:e,attrs:{shape:[-1,f]}});u.push(h);let b=n.dtype,x=[h.shape[0],i],C=Ct({backend:e,attrs:{shape:x,value:0,dtype:b}}),k=new dl(h.shape,x,b),v=[{type:"int32",data:[i]},{type:"int32",data:[S.sizeFromShape(h.shape)]}],I=e.runWebGPUProgram(k,[h,s],b,v,C),T=G({inputs:{x:I},backend:e,attrs:{shape:m}});u.push(I);let R=T;if(l!=null){u.push(T);let M=N.getUndoAxesPermutation(l);R=Kt({inputs:{x:R},backend:e,attrs:{perm:M}})}return u.forEach(M=>e.disposeData(M.dataId)),R}var Z2={kernelName:Qn,backendName:"webgpu",kernelFunc:IF};var EF=[Ry,Yb,Zb,Qb,Jb,tw,rw,ow,nw,sw,iw,aw,uw,pw,lw,fw,dw,hw,gw,xw,bw,ww,Sw,Iw,Ew,$w,Py,Tw,Aw,Rw,Fw,Pw,Mw,_w,Bw,zw,Lw,Gw,Uw,Vw,Hw,qw,Xw,jw,Kw,Yw,Zw,Qw,Jw,tS,oS,nS,sS,iS,aS,uS,pS,lS,cS,Dy,mS,hS,fS,dS,gS,xS,yS,bS,wS,SS,CS,Fy,vS,Dw,kS,IS,ES,$S,NS,TS,DS,RS,AS,FS,PS,MS,BS,zS,cw,LS,GS,US,OS,WS,VS,mw,HS,qS,KS,XS,YS,eS,ZS,QS,JS,Cw,t2,o2,n2,s2,i2,a2,u2,p2,vw,l2,c2,m2,f2,Ay,d2,h2,g2,x2,y2,b2,w2,S2,C2,v2,k2,I2,E2,$2,N2,T2,yw,G2,O2,W2,jS,D2,A2,R2,F2,M2,_2,B2,z2,L2,U2,rS,V2,H2,q2,P2,X2,j2,ew,Y2,Z2,e2];for(let r of EF)Tl(r);export{_o as Abs,Bo as Acos,zo as Acosh,ko as AdadeltaOptimizer,Io as AdagradOptimizer,Eo as AdamOptimizer,$o as AdamaxOptimizer,Ir as Add,Lo as AddN,gl as All,xl as Any,Go as ArgMax,Oo as ArgMin,Wo as Asin,Uo as Asinh,Vo as Atan,qo as Atan2,Ho as Atanh,Ko as AvgPool,Xo as AvgPool3D,_i as AvgPool3DGrad,Mi as AvgPoolGrad,jo as BatchMatMul,Yo as BatchToSpaceND,Bi as Bincount,zi as BitwiseAnd,Li as BroadcastArgs,of as BroadcastTo,ir as Cast,Er as Ceil,Zo as ClipByValue,Bs as Complex,Qo as ComplexAbs,Jo as Concat,tn as Conv2D,Gi as Conv2DBackpropFilter,en as Conv2DBackpropInput,rn as Conv3D,Oi as Conv3DBackpropFilterV2,Wi as Conv3DBackpropInputV2,Ui as Cos,on as Cosh,Hi as CropAndResize,Vi as Cumprod,nn as Cumsum,qs as DataStorage,qi as DenseBincount,Ki as DepthToSpace,sn as DepthwiseConv2dNative,Xi as DepthwiseConv2dNativeBackpropFilter,ji as DepthwiseConv2dNativeBackpropInput,Yi as Diag,an as Dilation2D,Qi as Dilation2DBackpropFilter,Zi as Dilation2DBackpropInput,zs as Draw,Il as ENV,Ji as Einsum,Ls as Elu,ta as EluGrad,Xs as Environment,pn as Equal,ea as Erf,ln as Exp,cn as ExpandDims,$r as Expm1,yl as FFT,ra as Fill,oa as FlipLeftRight,Nr as Floor,Tr as FloorDiv,Ws as FromPixels,mn as FusedBatchNorm,Vs as FusedConv2D,Hs as FusedDepthwiseConv2D,na as GatherNd,fn as GatherV2,dn as Greater,Dr as GreaterEqual,sa as IFFT,ar as Identity,ia as Imag,hn as IsFinite,gn as IsInf,xn as IsNan,Zr as KernelBackend,ca as LRN,ma as LRNGrad,yn as LeakyRelu,bn as Less,wn as LessEqual,aa as LinSpace,Sn as Log,Cn as Log1p,nf as LogSoftmax,ua as LogicalAnd,pa as LogicalNot,la as LogicalOr,NF as LogicalXor,TF as LowerBound,DF as MatrixBandPart,fa as Max,vn as MaxPool,kn as MaxPool3D,ha as MaxPool3DGrad,da as MaxPoolGrad,ga as MaxPoolWithArgmax,Ar as Maximum,In as Mean,xa as Min,Rr as Minimum,En as MirrorPad,ya as Mod,No as MomentumOptimizer,ba as Multinomial,Fr as Multiply,Gs as Neg,wa as NonMaxSuppressionV3,sf as NonMaxSuppressionV4,Sa as NonMaxSuppressionV5,$n as NotEqual,jf as OP_SCOPE_SUFFIX,Tn as OneHot,Nn as OnesLike,Jt as Optimizer,vi as OptimizerConstructors,Dn as Pack,An as PadV2,AF as Pool,Ca as Pow,Rn as Prelu,jr as Prod,To as RMSPropOptimizer,af as RaggedGather,uf as RaggedRange,pf as RaggedTensorToTensor,va as Range,zl as Rank,Os as Real,un as RealDiv,Fn as Reciprocal,$t as Reduction,Pn as Relu,zn as Relu6,Mn as Reshape,Bn as ResizeBilinear,Ia as ResizeBilinearGrad,_n as ResizeNearestNeighbor,ka as ResizeNearestNeighborGrad,Ln as Reverse,Oa as RotateWithOffset,Gn as Round,Pr as Rsqrt,wr as SGDOptimizer,Ea as ScatterNd,Na as SearchSorted,On as Select,Wn as Selu,Mr as Sigmoid,Vn as Sign,Ta as Sin,Un as Sinh,Yr as Slice,Xn as Softmax,Hn as Softplus,qn as SpaceToBatchND,lf as SparseFillEmptyRows,cf as SparseReshape,Aa as SparseSegmentMean,Ra as SparseSegmentSum,Fa as SparseToDense,Kn as SplitV,_r as Sqrt,Pa as Square,Br as SquaredDifference,Ma as StaticRegexReplace,ts as Step,_a as StridedSlice,Ba as StringNGrams,mf as StringSplit,ff as StringToHashBucketFast,jn as Sub,Da as Sum,za as Tan,Yn as Tanh,xt as Tensor,he as TensorBuffer,$a as TensorScatterUpdate,zr as Tile,La as TopK,Ga as Transform,Lr as Transpose,df as Unique,Zn as Unpack,Qn as UnsortedSegmentSum,RF as UpperBound,pr as Variable,Jn as ZerosLike,Us as _FusedMatMul,Ot as abs,uv as acos,lv as acosh,O as add,mv as addN,dv as all,gv as any,yv as argMax,wv as argMin,Cv as asin,kv as asinh,Ev as atan,Nv as atan2,Dv as atanh,Rc as avgPool,Fv as avgPool3d,Rd as backend,N as backend_util,zv as basicLSTMCell,mo as batchNorm,Wv as batchNorm2d,Vv as batchNorm3d,qv as batchNorm4d,fi as batchToSpaceND,Fc as bincount,jv as bitwiseAnd,jrt as booleanMaskAsync,Zv as broadcastArgs,ao as broadcastTo,$e as broadcast_util,sg as browser,st as buffer,_ as cast,Jv as ceil,ek as clipByValue,Oe as clone,ae as complex,Et as concat,ok as concat1d,sk as concat2d,ak as concat3d,pk as concat4d,ck as conv1d,fr as conv2d,fk as conv2dTranspose,hk as conv3d,xk as conv3dTranspose,UF as copyRegisteredKernels,di as cos,Pc as cosh,$u as cosineWindow,xu as cumprod,oc as cumsum,Qt as customGrad,Ck as denseBincount,A1 as deprecationWarn,kk as depthToSpace,hi as depthwiseConv2d,lc as device_util,$k as diag,Tk as dilation2d,kG as disableDeprecationWarnings,Ft as dispose,IG as disposeVariables,V as div,Ak as divNoNan,Fk as dot,zot as dropout,fo as einsum,Mc as elu,vG as enableDebugMode,CG as enableProdMode,Ug as enclosingPowerOfTwo,eu as engine,Bk as ensureShape,L as env,ai as equal,Lk as erf,Vk as euclideanNorm,zt as exp,Ae as expandDims,Kk as expm1,_c as eye,wi as fft,yr as fill,RG as findBackend,FG as findBackendFactory,ui as floor,Kl as floorDiv,Kg as fused,gi as gather,Eot as gatherND,ag as gather_util,Dd as getBackend,Nl as getGradient,is as getKernel,Va as getKernelsForBackend,aI as grad,uI as grads,Zt as greater,mr as greaterEqual,ks as ifft,uo as imag,lct as image,Hot as inTopKAsync,Jh as io,rm as irfft,Zk as isFinite,Jk as isInf,eI as isNaN,Td as keep,Is as kernel_impls,Bc as leakyRelu,hs as less,Ge as lessEqual,dct as linalg,oI as linspace,sI as localResponseNormalization,Je as log,zc as log1p,fI as logSigmoid,hI as logSoftmax,Oc as logSumExp,Ze as logicalAnd,xi as logicalNot,Wc as logicalOr,wI as logicalXor,kct as losses,CI as lowerBound,nt as matMul,eg as math,br as max,Uc as maxPool,II as maxPool3d,$I as maxPoolWithArgmax,yi as maximum,Cs as mean,EG as memory,DI as meshgrid,yu as min,vs as minimum,FI as mirrorPad,MI as mod,BI as moments,iot as movingAverage,$ as mul,LI as multiRNNCell,OI as multinomial,lt as neg,z$ as nextFrame,Ss as norm,Vc as notEqual,fu as oneHot,ee as ones,VI as onesLike,g as op,qI as outerProduct,Ve as pad,jI as pad1d,ZI as pad2d,JI as pad3d,e3 as pad4d,s3 as pool,De as pow,Hc as prelu,qc as print,u3 as prod,$G as profile,l3 as raggedGather,m3 as raggedRange,d3 as raggedTensorToTensor,g3 as rand,k3 as randomGamma,Jc as randomNormal,$3 as randomStandardNormal,bi as randomUniform,D3 as randomUniformInt,xo as range,DG as ready,Ur as real,R3 as reciprocal,Ad as registerBackend,Cf as registerGradient,Tl as registerKernel,yo as relu,tm as relu6,AG as removeBackend,E as reshape,ue as reverse,B3 as reverse1d,L3 as reverse2d,O3 as reverse3d,U3 as reverse4d,Si as rfft,em as round,nc as rsqrt,X as scalar,fot as scatterND,du as scatter_util,Su as searchSorted,q3 as selu,X3 as separableConv2d,yg as serialization,TG as setBackend,PG as setPlatform,Y3 as setdiff1dAsync,Ue as sigmoid,Q3 as sign,Xlt as signal,Zl as sin,Ql as sinh,at as slice,tE as slice1d,rE as slice2d,nE as slice3d,iE as slice4d,be as slice_util,uE as softmax,Gc as softplus,si as spaceToBatchND,Tct as sparse,wot as sparseToDense,Ult as spectral,Qe as split,At as sqrt,tt as square,om as squaredDifference,Ci as squeeze,Te as stack,cr as step,gE as stridedSlice,Pct as string,U as sub,K as sum,Ul as sumOutType,yE as tan,gu as tanh,hr as tensor,Wt as tensor1d,bo as tensor2d,vc as tensor3d,bE as tensor4d,wE as tensor5d,SE as tensor6d,vE as tensorScatterUpdate,qf as tensor_util,Sg as test_util,dt as tidy,dr as tile,NG as time,IE as topk,nxt as train,te as transpose,$E as truncatedNormal,TE as unique,WF as unregisterGradient,OF as unregisterKernel,sc as unsortedSegmentSum,po as unstack,qt as upcastType,DE as upperBound,S as util,pI as valueAndGrad,lI as valueAndGrads,AE as variable,Lc as variableGrads,sv as version_core,It as where,nm as whereAsync,ye as zeros,Z as zerosLike};
/*! For license information please see tfjs-webgpu.js.LEGAL.txt */
