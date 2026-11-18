import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/jpeg-js/lib/encoder.js
var require_encoder = __commonJS({
  "node_modules/jpeg-js/lib/encoder.js"(exports, module) {
    var btoa = btoa || function(buf) {
      return Buffer.from(buf).toString("base64");
    };
    function JPEGEncoder(quality) {
      var self = this;
      var fround = Math.round;
      var ffloor = Math.floor;
      var YTable = new Array(64);
      var UVTable = new Array(64);
      var fdtbl_Y = new Array(64);
      var fdtbl_UV = new Array(64);
      var YDC_HT;
      var UVDC_HT;
      var YAC_HT;
      var UVAC_HT;
      var bitcode = new Array(65535);
      var category = new Array(65535);
      var outputfDCTQuant = new Array(64);
      var DU = new Array(64);
      var byteout = [];
      var bytenew = 0;
      var bytepos = 7;
      var YDU = new Array(64);
      var UDU = new Array(64);
      var VDU = new Array(64);
      var clt = new Array(256);
      var RGB_YUV_TABLE = new Array(2048);
      var currentQuality;
      var ZigZag = [
        0,
        1,
        5,
        6,
        14,
        15,
        27,
        28,
        2,
        4,
        7,
        13,
        16,
        26,
        29,
        42,
        3,
        8,
        12,
        17,
        25,
        30,
        41,
        43,
        9,
        11,
        18,
        24,
        31,
        40,
        44,
        53,
        10,
        19,
        23,
        32,
        39,
        45,
        52,
        54,
        20,
        22,
        33,
        38,
        46,
        51,
        55,
        60,
        21,
        34,
        37,
        47,
        50,
        56,
        59,
        61,
        35,
        36,
        48,
        49,
        57,
        58,
        62,
        63
      ];
      var std_dc_luminance_nrcodes = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
      var std_dc_luminance_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      var std_ac_luminance_nrcodes = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
      var std_ac_luminance_values = [
        1,
        2,
        3,
        0,
        4,
        17,
        5,
        18,
        33,
        49,
        65,
        6,
        19,
        81,
        97,
        7,
        34,
        113,
        20,
        50,
        129,
        145,
        161,
        8,
        35,
        66,
        177,
        193,
        21,
        82,
        209,
        240,
        36,
        51,
        98,
        114,
        130,
        9,
        10,
        22,
        23,
        24,
        25,
        26,
        37,
        38,
        39,
        40,
        41,
        42,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        67,
        68,
        69,
        70,
        71,
        72,
        73,
        74,
        83,
        84,
        85,
        86,
        87,
        88,
        89,
        90,
        99,
        100,
        101,
        102,
        103,
        104,
        105,
        106,
        115,
        116,
        117,
        118,
        119,
        120,
        121,
        122,
        131,
        132,
        133,
        134,
        135,
        136,
        137,
        138,
        146,
        147,
        148,
        149,
        150,
        151,
        152,
        153,
        154,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        178,
        179,
        180,
        181,
        182,
        183,
        184,
        185,
        186,
        194,
        195,
        196,
        197,
        198,
        199,
        200,
        201,
        202,
        210,
        211,
        212,
        213,
        214,
        215,
        216,
        217,
        218,
        225,
        226,
        227,
        228,
        229,
        230,
        231,
        232,
        233,
        234,
        241,
        242,
        243,
        244,
        245,
        246,
        247,
        248,
        249,
        250
      ];
      var std_dc_chrominance_nrcodes = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
      var std_dc_chrominance_values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      var std_ac_chrominance_nrcodes = [0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119];
      var std_ac_chrominance_values = [
        0,
        1,
        2,
        3,
        17,
        4,
        5,
        33,
        49,
        6,
        18,
        65,
        81,
        7,
        97,
        113,
        19,
        34,
        50,
        129,
        8,
        20,
        66,
        145,
        161,
        177,
        193,
        9,
        35,
        51,
        82,
        240,
        21,
        98,
        114,
        209,
        10,
        22,
        36,
        52,
        225,
        37,
        241,
        23,
        24,
        25,
        26,
        38,
        39,
        40,
        41,
        42,
        53,
        54,
        55,
        56,
        57,
        58,
        67,
        68,
        69,
        70,
        71,
        72,
        73,
        74,
        83,
        84,
        85,
        86,
        87,
        88,
        89,
        90,
        99,
        100,
        101,
        102,
        103,
        104,
        105,
        106,
        115,
        116,
        117,
        118,
        119,
        120,
        121,
        122,
        130,
        131,
        132,
        133,
        134,
        135,
        136,
        137,
        138,
        146,
        147,
        148,
        149,
        150,
        151,
        152,
        153,
        154,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        178,
        179,
        180,
        181,
        182,
        183,
        184,
        185,
        186,
        194,
        195,
        196,
        197,
        198,
        199,
        200,
        201,
        202,
        210,
        211,
        212,
        213,
        214,
        215,
        216,
        217,
        218,
        226,
        227,
        228,
        229,
        230,
        231,
        232,
        233,
        234,
        242,
        243,
        244,
        245,
        246,
        247,
        248,
        249,
        250
      ];
      function initQuantTables(sf) {
        var YQT = [
          16,
          11,
          10,
          16,
          24,
          40,
          51,
          61,
          12,
          12,
          14,
          19,
          26,
          58,
          60,
          55,
          14,
          13,
          16,
          24,
          40,
          57,
          69,
          56,
          14,
          17,
          22,
          29,
          51,
          87,
          80,
          62,
          18,
          22,
          37,
          56,
          68,
          109,
          103,
          77,
          24,
          35,
          55,
          64,
          81,
          104,
          113,
          92,
          49,
          64,
          78,
          87,
          103,
          121,
          120,
          101,
          72,
          92,
          95,
          98,
          112,
          100,
          103,
          99
        ];
        for (var i = 0; i < 64; i++) {
          var t = ffloor((YQT[i] * sf + 50) / 100);
          if (t < 1) {
            t = 1;
          } else if (t > 255) {
            t = 255;
          }
          YTable[ZigZag[i]] = t;
        }
        var UVQT = [
          17,
          18,
          24,
          47,
          99,
          99,
          99,
          99,
          18,
          21,
          26,
          66,
          99,
          99,
          99,
          99,
          24,
          26,
          56,
          99,
          99,
          99,
          99,
          99,
          47,
          66,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99,
          99
        ];
        for (var j = 0; j < 64; j++) {
          var u = ffloor((UVQT[j] * sf + 50) / 100);
          if (u < 1) {
            u = 1;
          } else if (u > 255) {
            u = 255;
          }
          UVTable[ZigZag[j]] = u;
        }
        var aasf = [
          1,
          1.387039845,
          1.306562965,
          1.175875602,
          1,
          0.785694958,
          0.5411961,
          0.275899379
        ];
        var k = 0;
        for (var row = 0; row < 8; row++) {
          for (var col = 0; col < 8; col++) {
            fdtbl_Y[k] = 1 / (YTable[ZigZag[k]] * aasf[row] * aasf[col] * 8);
            fdtbl_UV[k] = 1 / (UVTable[ZigZag[k]] * aasf[row] * aasf[col] * 8);
            k++;
          }
        }
      }
      function computeHuffmanTbl(nrcodes, std_table) {
        var codevalue = 0;
        var pos_in_table = 0;
        var HT = new Array();
        for (var k = 1; k <= 16; k++) {
          for (var j = 1; j <= nrcodes[k]; j++) {
            HT[std_table[pos_in_table]] = [];
            HT[std_table[pos_in_table]][0] = codevalue;
            HT[std_table[pos_in_table]][1] = k;
            pos_in_table++;
            codevalue++;
          }
          codevalue *= 2;
        }
        return HT;
      }
      function initHuffmanTbl() {
        YDC_HT = computeHuffmanTbl(std_dc_luminance_nrcodes, std_dc_luminance_values);
        UVDC_HT = computeHuffmanTbl(std_dc_chrominance_nrcodes, std_dc_chrominance_values);
        YAC_HT = computeHuffmanTbl(std_ac_luminance_nrcodes, std_ac_luminance_values);
        UVAC_HT = computeHuffmanTbl(std_ac_chrominance_nrcodes, std_ac_chrominance_values);
      }
      function initCategoryNumber() {
        var nrlower = 1;
        var nrupper = 2;
        for (var cat = 1; cat <= 15; cat++) {
          for (var nr = nrlower; nr < nrupper; nr++) {
            category[32767 + nr] = cat;
            bitcode[32767 + nr] = [];
            bitcode[32767 + nr][1] = cat;
            bitcode[32767 + nr][0] = nr;
          }
          for (var nrneg = -(nrupper - 1); nrneg <= -nrlower; nrneg++) {
            category[32767 + nrneg] = cat;
            bitcode[32767 + nrneg] = [];
            bitcode[32767 + nrneg][1] = cat;
            bitcode[32767 + nrneg][0] = nrupper - 1 + nrneg;
          }
          nrlower <<= 1;
          nrupper <<= 1;
        }
      }
      function initRGBYUVTable() {
        for (var i = 0; i < 256; i++) {
          RGB_YUV_TABLE[i] = 19595 * i;
          RGB_YUV_TABLE[i + 256 >> 0] = 38470 * i;
          RGB_YUV_TABLE[i + 512 >> 0] = 7471 * i + 32768;
          RGB_YUV_TABLE[i + 768 >> 0] = -11059 * i;
          RGB_YUV_TABLE[i + 1024 >> 0] = -21709 * i;
          RGB_YUV_TABLE[i + 1280 >> 0] = 32768 * i + 8421375;
          RGB_YUV_TABLE[i + 1536 >> 0] = -27439 * i;
          RGB_YUV_TABLE[i + 1792 >> 0] = -5329 * i;
        }
      }
      function writeBits(bs) {
        var value = bs[0];
        var posval = bs[1] - 1;
        while (posval >= 0) {
          if (value & 1 << posval) {
            bytenew |= 1 << bytepos;
          }
          posval--;
          bytepos--;
          if (bytepos < 0) {
            if (bytenew == 255) {
              writeByte(255);
              writeByte(0);
            } else {
              writeByte(bytenew);
            }
            bytepos = 7;
            bytenew = 0;
          }
        }
      }
      function writeByte(value) {
        byteout.push(value);
      }
      function writeWord(value) {
        writeByte(value >> 8 & 255);
        writeByte(value & 255);
      }
      function fDCTQuant(data, fdtbl) {
        var d0, d1, d2, d3, d4, d5, d6, d7;
        var dataOff = 0;
        var i;
        var I8 = 8;
        var I64 = 64;
        for (i = 0; i < I8; ++i) {
          d0 = data[dataOff];
          d1 = data[dataOff + 1];
          d2 = data[dataOff + 2];
          d3 = data[dataOff + 3];
          d4 = data[dataOff + 4];
          d5 = data[dataOff + 5];
          d6 = data[dataOff + 6];
          d7 = data[dataOff + 7];
          var tmp0 = d0 + d7;
          var tmp7 = d0 - d7;
          var tmp1 = d1 + d6;
          var tmp6 = d1 - d6;
          var tmp2 = d2 + d5;
          var tmp5 = d2 - d5;
          var tmp3 = d3 + d4;
          var tmp4 = d3 - d4;
          var tmp10 = tmp0 + tmp3;
          var tmp13 = tmp0 - tmp3;
          var tmp11 = tmp1 + tmp2;
          var tmp12 = tmp1 - tmp2;
          data[dataOff] = tmp10 + tmp11;
          data[dataOff + 4] = tmp10 - tmp11;
          var z1 = (tmp12 + tmp13) * 0.707106781;
          data[dataOff + 2] = tmp13 + z1;
          data[dataOff + 6] = tmp13 - z1;
          tmp10 = tmp4 + tmp5;
          tmp11 = tmp5 + tmp6;
          tmp12 = tmp6 + tmp7;
          var z5 = (tmp10 - tmp12) * 0.382683433;
          var z2 = 0.5411961 * tmp10 + z5;
          var z4 = 1.306562965 * tmp12 + z5;
          var z3 = tmp11 * 0.707106781;
          var z11 = tmp7 + z3;
          var z13 = tmp7 - z3;
          data[dataOff + 5] = z13 + z2;
          data[dataOff + 3] = z13 - z2;
          data[dataOff + 1] = z11 + z4;
          data[dataOff + 7] = z11 - z4;
          dataOff += 8;
        }
        dataOff = 0;
        for (i = 0; i < I8; ++i) {
          d0 = data[dataOff];
          d1 = data[dataOff + 8];
          d2 = data[dataOff + 16];
          d3 = data[dataOff + 24];
          d4 = data[dataOff + 32];
          d5 = data[dataOff + 40];
          d6 = data[dataOff + 48];
          d7 = data[dataOff + 56];
          var tmp0p2 = d0 + d7;
          var tmp7p2 = d0 - d7;
          var tmp1p2 = d1 + d6;
          var tmp6p2 = d1 - d6;
          var tmp2p2 = d2 + d5;
          var tmp5p2 = d2 - d5;
          var tmp3p2 = d3 + d4;
          var tmp4p2 = d3 - d4;
          var tmp10p2 = tmp0p2 + tmp3p2;
          var tmp13p2 = tmp0p2 - tmp3p2;
          var tmp11p2 = tmp1p2 + tmp2p2;
          var tmp12p2 = tmp1p2 - tmp2p2;
          data[dataOff] = tmp10p2 + tmp11p2;
          data[dataOff + 32] = tmp10p2 - tmp11p2;
          var z1p2 = (tmp12p2 + tmp13p2) * 0.707106781;
          data[dataOff + 16] = tmp13p2 + z1p2;
          data[dataOff + 48] = tmp13p2 - z1p2;
          tmp10p2 = tmp4p2 + tmp5p2;
          tmp11p2 = tmp5p2 + tmp6p2;
          tmp12p2 = tmp6p2 + tmp7p2;
          var z5p2 = (tmp10p2 - tmp12p2) * 0.382683433;
          var z2p2 = 0.5411961 * tmp10p2 + z5p2;
          var z4p2 = 1.306562965 * tmp12p2 + z5p2;
          var z3p2 = tmp11p2 * 0.707106781;
          var z11p2 = tmp7p2 + z3p2;
          var z13p2 = tmp7p2 - z3p2;
          data[dataOff + 40] = z13p2 + z2p2;
          data[dataOff + 24] = z13p2 - z2p2;
          data[dataOff + 8] = z11p2 + z4p2;
          data[dataOff + 56] = z11p2 - z4p2;
          dataOff++;
        }
        var fDCTQuant2;
        for (i = 0; i < I64; ++i) {
          fDCTQuant2 = data[i] * fdtbl[i];
          outputfDCTQuant[i] = fDCTQuant2 > 0 ? fDCTQuant2 + 0.5 | 0 : fDCTQuant2 - 0.5 | 0;
        }
        return outputfDCTQuant;
      }
      function writeAPP0() {
        writeWord(65504);
        writeWord(16);
        writeByte(74);
        writeByte(70);
        writeByte(73);
        writeByte(70);
        writeByte(0);
        writeByte(1);
        writeByte(1);
        writeByte(0);
        writeWord(1);
        writeWord(1);
        writeByte(0);
        writeByte(0);
      }
      function writeAPP1(exifBuffer) {
        if (!exifBuffer) return;
        writeWord(65505);
        if (exifBuffer[0] === 69 && exifBuffer[1] === 120 && exifBuffer[2] === 105 && exifBuffer[3] === 102) {
          writeWord(exifBuffer.length + 2);
        } else {
          writeWord(exifBuffer.length + 5 + 2);
          writeByte(69);
          writeByte(120);
          writeByte(105);
          writeByte(102);
          writeByte(0);
        }
        for (var i = 0; i < exifBuffer.length; i++) {
          writeByte(exifBuffer[i]);
        }
      }
      function writeSOF0(width, height) {
        writeWord(65472);
        writeWord(17);
        writeByte(8);
        writeWord(height);
        writeWord(width);
        writeByte(3);
        writeByte(1);
        writeByte(17);
        writeByte(0);
        writeByte(2);
        writeByte(17);
        writeByte(1);
        writeByte(3);
        writeByte(17);
        writeByte(1);
      }
      function writeDQT() {
        writeWord(65499);
        writeWord(132);
        writeByte(0);
        for (var i = 0; i < 64; i++) {
          writeByte(YTable[i]);
        }
        writeByte(1);
        for (var j = 0; j < 64; j++) {
          writeByte(UVTable[j]);
        }
      }
      function writeDHT() {
        writeWord(65476);
        writeWord(418);
        writeByte(0);
        for (var i = 0; i < 16; i++) {
          writeByte(std_dc_luminance_nrcodes[i + 1]);
        }
        for (var j = 0; j <= 11; j++) {
          writeByte(std_dc_luminance_values[j]);
        }
        writeByte(16);
        for (var k = 0; k < 16; k++) {
          writeByte(std_ac_luminance_nrcodes[k + 1]);
        }
        for (var l = 0; l <= 161; l++) {
          writeByte(std_ac_luminance_values[l]);
        }
        writeByte(1);
        for (var m = 0; m < 16; m++) {
          writeByte(std_dc_chrominance_nrcodes[m + 1]);
        }
        for (var n = 0; n <= 11; n++) {
          writeByte(std_dc_chrominance_values[n]);
        }
        writeByte(17);
        for (var o = 0; o < 16; o++) {
          writeByte(std_ac_chrominance_nrcodes[o + 1]);
        }
        for (var p = 0; p <= 161; p++) {
          writeByte(std_ac_chrominance_values[p]);
        }
      }
      function writeCOM(comments) {
        if (typeof comments === "undefined" || comments.constructor !== Array) return;
        comments.forEach((e) => {
          if (typeof e !== "string") return;
          writeWord(65534);
          var l = e.length;
          writeWord(l + 2);
          var i;
          for (i = 0; i < l; i++)
            writeByte(e.charCodeAt(i));
        });
      }
      function writeSOS() {
        writeWord(65498);
        writeWord(12);
        writeByte(3);
        writeByte(1);
        writeByte(0);
        writeByte(2);
        writeByte(17);
        writeByte(3);
        writeByte(17);
        writeByte(0);
        writeByte(63);
        writeByte(0);
      }
      function processDU(CDU, fdtbl, DC, HTDC, HTAC) {
        var EOB = HTAC[0];
        var M16zeroes = HTAC[240];
        var pos;
        var I16 = 16;
        var I63 = 63;
        var I64 = 64;
        var DU_DCT = fDCTQuant(CDU, fdtbl);
        for (var j = 0; j < I64; ++j) {
          DU[ZigZag[j]] = DU_DCT[j];
        }
        var Diff = DU[0] - DC;
        DC = DU[0];
        if (Diff == 0) {
          writeBits(HTDC[0]);
        } else {
          pos = 32767 + Diff;
          writeBits(HTDC[category[pos]]);
          writeBits(bitcode[pos]);
        }
        var end0pos = 63;
        for (; end0pos > 0 && DU[end0pos] == 0; end0pos--) {
        }
        ;
        if (end0pos == 0) {
          writeBits(EOB);
          return DC;
        }
        var i = 1;
        var lng;
        while (i <= end0pos) {
          var startpos = i;
          for (; DU[i] == 0 && i <= end0pos; ++i) {
          }
          var nrzeroes = i - startpos;
          if (nrzeroes >= I16) {
            lng = nrzeroes >> 4;
            for (var nrmarker = 1; nrmarker <= lng; ++nrmarker)
              writeBits(M16zeroes);
            nrzeroes = nrzeroes & 15;
          }
          pos = 32767 + DU[i];
          writeBits(HTAC[(nrzeroes << 4) + category[pos]]);
          writeBits(bitcode[pos]);
          i++;
        }
        if (end0pos != I63) {
          writeBits(EOB);
        }
        return DC;
      }
      function initCharLookupTable() {
        var sfcc = String.fromCharCode;
        for (var i = 0; i < 256; i++) {
          clt[i] = sfcc(i);
        }
      }
      this.encode = function(image, quality2) {
        var time_start = (/* @__PURE__ */ new Date()).getTime();
        if (quality2) setQuality(quality2);
        byteout = new Array();
        bytenew = 0;
        bytepos = 7;
        writeWord(65496);
        writeAPP0();
        writeCOM(image.comments);
        writeAPP1(image.exifBuffer);
        writeDQT();
        writeSOF0(image.width, image.height);
        writeDHT();
        writeSOS();
        var DCY = 0;
        var DCU = 0;
        var DCV = 0;
        bytenew = 0;
        bytepos = 7;
        this.encode.displayName = "_encode_";
        var imageData = image.data;
        var width = image.width;
        var height = image.height;
        var quadWidth = width * 4;
        var tripleWidth = width * 3;
        var x, y = 0;
        var r, g, b;
        var start, p, col, row, pos;
        while (y < height) {
          x = 0;
          while (x < quadWidth) {
            start = quadWidth * y + x;
            p = start;
            col = -1;
            row = 0;
            for (pos = 0; pos < 64; pos++) {
              row = pos >> 3;
              col = (pos & 7) * 4;
              p = start + row * quadWidth + col;
              if (y + row >= height) {
                p -= quadWidth * (y + 1 + row - height);
              }
              if (x + col >= quadWidth) {
                p -= x + col - quadWidth + 4;
              }
              r = imageData[p++];
              g = imageData[p++];
              b = imageData[p++];
              YDU[pos] = (RGB_YUV_TABLE[r] + RGB_YUV_TABLE[g + 256 >> 0] + RGB_YUV_TABLE[b + 512 >> 0] >> 16) - 128;
              UDU[pos] = (RGB_YUV_TABLE[r + 768 >> 0] + RGB_YUV_TABLE[g + 1024 >> 0] + RGB_YUV_TABLE[b + 1280 >> 0] >> 16) - 128;
              VDU[pos] = (RGB_YUV_TABLE[r + 1280 >> 0] + RGB_YUV_TABLE[g + 1536 >> 0] + RGB_YUV_TABLE[b + 1792 >> 0] >> 16) - 128;
            }
            DCY = processDU(YDU, fdtbl_Y, DCY, YDC_HT, YAC_HT);
            DCU = processDU(UDU, fdtbl_UV, DCU, UVDC_HT, UVAC_HT);
            DCV = processDU(VDU, fdtbl_UV, DCV, UVDC_HT, UVAC_HT);
            x += 32;
          }
          y += 8;
        }
        if (bytepos >= 0) {
          var fillbits = [];
          fillbits[1] = bytepos + 1;
          fillbits[0] = (1 << bytepos + 1) - 1;
          writeBits(fillbits);
        }
        writeWord(65497);
        if (typeof module === "undefined") return new Uint8Array(byteout);
        return Buffer.from(byteout);
        var jpegDataUri = "data:image/jpeg;base64," + btoa(byteout.join(""));
        byteout = [];
        var duration = (/* @__PURE__ */ new Date()).getTime() - time_start;
        return jpegDataUri;
      };
      function setQuality(quality2) {
        if (quality2 <= 0) {
          quality2 = 1;
        }
        if (quality2 > 100) {
          quality2 = 100;
        }
        if (currentQuality == quality2) return;
        var sf = 0;
        if (quality2 < 50) {
          sf = Math.floor(5e3 / quality2);
        } else {
          sf = Math.floor(200 - quality2 * 2);
        }
        initQuantTables(sf);
        currentQuality = quality2;
      }
      function init() {
        var time_start = (/* @__PURE__ */ new Date()).getTime();
        if (!quality) quality = 50;
        initCharLookupTable();
        initHuffmanTbl();
        initCategoryNumber();
        initRGBYUVTable();
        setQuality(quality);
        var duration = (/* @__PURE__ */ new Date()).getTime() - time_start;
      }
      init();
    }
    if (typeof module !== "undefined") {
      module.exports = encode;
    } else if (typeof window !== "undefined") {
      window["jpeg-js"] = window["jpeg-js"] || {};
      window["jpeg-js"].encode = encode;
    }
    function encode(imgData, qu) {
      if (typeof qu === "undefined") qu = 50;
      var encoder = new JPEGEncoder(qu);
      var data = encoder.encode(imgData, qu);
      return {
        data,
        width: imgData.width,
        height: imgData.height
      };
    }
  }
});

// node_modules/jpeg-js/lib/decoder.js
var require_decoder = __commonJS({
  "node_modules/jpeg-js/lib/decoder.js"(exports, module) {
    var JpegImage = function jpegImage() {
      "use strict";
      var dctZigZag = new Int32Array([
        0,
        1,
        8,
        16,
        9,
        2,
        3,
        10,
        17,
        24,
        32,
        25,
        18,
        11,
        4,
        5,
        12,
        19,
        26,
        33,
        40,
        48,
        41,
        34,
        27,
        20,
        13,
        6,
        7,
        14,
        21,
        28,
        35,
        42,
        49,
        56,
        57,
        50,
        43,
        36,
        29,
        22,
        15,
        23,
        30,
        37,
        44,
        51,
        58,
        59,
        52,
        45,
        38,
        31,
        39,
        46,
        53,
        60,
        61,
        54,
        47,
        55,
        62,
        63
      ]);
      var dctCos1 = 4017;
      var dctSin1 = 799;
      var dctCos3 = 3406;
      var dctSin3 = 2276;
      var dctCos6 = 1567;
      var dctSin6 = 3784;
      var dctSqrt2 = 5793;
      var dctSqrt1d2 = 2896;
      function constructor() {
      }
      function buildHuffmanTable(codeLengths, values) {
        var k = 0, code = [], i, j, length = 16;
        while (length > 0 && !codeLengths[length - 1])
          length--;
        code.push({ children: [], index: 0 });
        var p = code[0], q;
        for (i = 0; i < length; i++) {
          for (j = 0; j < codeLengths[i]; j++) {
            p = code.pop();
            p.children[p.index] = values[k];
            while (p.index > 0) {
              if (code.length === 0)
                throw new Error("Could not recreate Huffman Table");
              p = code.pop();
            }
            p.index++;
            code.push(p);
            while (code.length <= i) {
              code.push(q = { children: [], index: 0 });
              p.children[p.index] = q.children;
              p = q;
            }
            k++;
          }
          if (i + 1 < length) {
            code.push(q = { children: [], index: 0 });
            p.children[p.index] = q.children;
            p = q;
          }
        }
        return code[0].children;
      }
      function decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successivePrev, successive, opts) {
        var precision = frame.precision;
        var samplesPerLine = frame.samplesPerLine;
        var scanLines = frame.scanLines;
        var mcusPerLine = frame.mcusPerLine;
        var progressive = frame.progressive;
        var maxH = frame.maxH, maxV = frame.maxV;
        var startOffset = offset, bitsData = 0, bitsCount = 0;
        function readBit() {
          if (bitsCount > 0) {
            bitsCount--;
            return bitsData >> bitsCount & 1;
          }
          bitsData = data[offset++];
          if (bitsData == 255) {
            var nextByte = data[offset++];
            if (nextByte) {
              throw new Error("unexpected marker: " + (bitsData << 8 | nextByte).toString(16));
            }
          }
          bitsCount = 7;
          return bitsData >>> 7;
        }
        function decodeHuffman(tree) {
          var node = tree, bit;
          while ((bit = readBit()) !== null) {
            node = node[bit];
            if (typeof node === "number")
              return node;
            if (typeof node !== "object")
              throw new Error("invalid huffman sequence");
          }
          return null;
        }
        function receive(length) {
          var n2 = 0;
          while (length > 0) {
            var bit = readBit();
            if (bit === null) return;
            n2 = n2 << 1 | bit;
            length--;
          }
          return n2;
        }
        function receiveAndExtend(length) {
          var n2 = receive(length);
          if (n2 >= 1 << length - 1)
            return n2;
          return n2 + (-1 << length) + 1;
        }
        function decodeBaseline(component2, zz) {
          var t = decodeHuffman(component2.huffmanTableDC);
          var diff = t === 0 ? 0 : receiveAndExtend(t);
          zz[0] = component2.pred += diff;
          var k2 = 1;
          while (k2 < 64) {
            var rs = decodeHuffman(component2.huffmanTableAC);
            var s = rs & 15, r = rs >> 4;
            if (s === 0) {
              if (r < 15)
                break;
              k2 += 16;
              continue;
            }
            k2 += r;
            var z = dctZigZag[k2];
            zz[z] = receiveAndExtend(s);
            k2++;
          }
        }
        function decodeDCFirst(component2, zz) {
          var t = decodeHuffman(component2.huffmanTableDC);
          var diff = t === 0 ? 0 : receiveAndExtend(t) << successive;
          zz[0] = component2.pred += diff;
        }
        function decodeDCSuccessive(component2, zz) {
          zz[0] |= readBit() << successive;
        }
        var eobrun = 0;
        function decodeACFirst(component2, zz) {
          if (eobrun > 0) {
            eobrun--;
            return;
          }
          var k2 = spectralStart, e = spectralEnd;
          while (k2 <= e) {
            var rs = decodeHuffman(component2.huffmanTableAC);
            var s = rs & 15, r = rs >> 4;
            if (s === 0) {
              if (r < 15) {
                eobrun = receive(r) + (1 << r) - 1;
                break;
              }
              k2 += 16;
              continue;
            }
            k2 += r;
            var z = dctZigZag[k2];
            zz[z] = receiveAndExtend(s) * (1 << successive);
            k2++;
          }
        }
        var successiveACState = 0, successiveACNextValue;
        function decodeACSuccessive(component2, zz) {
          var k2 = spectralStart, e = spectralEnd, r = 0;
          while (k2 <= e) {
            var z = dctZigZag[k2];
            var direction = zz[z] < 0 ? -1 : 1;
            switch (successiveACState) {
              case 0:
                var rs = decodeHuffman(component2.huffmanTableAC);
                var s = rs & 15, r = rs >> 4;
                if (s === 0) {
                  if (r < 15) {
                    eobrun = receive(r) + (1 << r);
                    successiveACState = 4;
                  } else {
                    r = 16;
                    successiveACState = 1;
                  }
                } else {
                  if (s !== 1)
                    throw new Error("invalid ACn encoding");
                  successiveACNextValue = receiveAndExtend(s);
                  successiveACState = r ? 2 : 3;
                }
                continue;
              case 1:
              // skipping r zero items
              case 2:
                if (zz[z])
                  zz[z] += (readBit() << successive) * direction;
                else {
                  r--;
                  if (r === 0)
                    successiveACState = successiveACState == 2 ? 3 : 0;
                }
                break;
              case 3:
                if (zz[z])
                  zz[z] += (readBit() << successive) * direction;
                else {
                  zz[z] = successiveACNextValue << successive;
                  successiveACState = 0;
                }
                break;
              case 4:
                if (zz[z])
                  zz[z] += (readBit() << successive) * direction;
                break;
            }
            k2++;
          }
          if (successiveACState === 4) {
            eobrun--;
            if (eobrun === 0)
              successiveACState = 0;
          }
        }
        function decodeMcu(component2, decode2, mcu2, row, col) {
          var mcuRow = mcu2 / mcusPerLine | 0;
          var mcuCol = mcu2 % mcusPerLine;
          var blockRow = mcuRow * component2.v + row;
          var blockCol = mcuCol * component2.h + col;
          if (component2.blocks[blockRow] === void 0 && opts.tolerantDecoding)
            return;
          decode2(component2, component2.blocks[blockRow][blockCol]);
        }
        function decodeBlock(component2, decode2, mcu2) {
          var blockRow = mcu2 / component2.blocksPerLine | 0;
          var blockCol = mcu2 % component2.blocksPerLine;
          if (component2.blocks[blockRow] === void 0 && opts.tolerantDecoding)
            return;
          decode2(component2, component2.blocks[blockRow][blockCol]);
        }
        var componentsLength = components.length;
        var component, i, j, k, n;
        var decodeFn;
        if (progressive) {
          if (spectralStart === 0)
            decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
          else
            decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
        } else {
          decodeFn = decodeBaseline;
        }
        var mcu = 0, marker;
        var mcuExpected;
        if (componentsLength == 1) {
          mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
        } else {
          mcuExpected = mcusPerLine * frame.mcusPerColumn;
        }
        if (!resetInterval) resetInterval = mcuExpected;
        var h, v;
        while (mcu < mcuExpected) {
          for (i = 0; i < componentsLength; i++)
            components[i].pred = 0;
          eobrun = 0;
          if (componentsLength == 1) {
            component = components[0];
            for (n = 0; n < resetInterval; n++) {
              decodeBlock(component, decodeFn, mcu);
              mcu++;
            }
          } else {
            for (n = 0; n < resetInterval; n++) {
              for (i = 0; i < componentsLength; i++) {
                component = components[i];
                h = component.h;
                v = component.v;
                for (j = 0; j < v; j++) {
                  for (k = 0; k < h; k++) {
                    decodeMcu(component, decodeFn, mcu, j, k);
                  }
                }
              }
              mcu++;
              if (mcu === mcuExpected) break;
            }
          }
          if (mcu === mcuExpected) {
            do {
              if (data[offset] === 255) {
                if (data[offset + 1] !== 0) {
                  break;
                }
              }
              offset += 1;
            } while (offset < data.length - 2);
          }
          bitsCount = 0;
          marker = data[offset] << 8 | data[offset + 1];
          if (marker < 65280) {
            throw new Error("marker was not found");
          }
          if (marker >= 65488 && marker <= 65495) {
            offset += 2;
          } else
            break;
        }
        return offset - startOffset;
      }
      function buildComponentData(frame, component) {
        var lines = [];
        var blocksPerLine = component.blocksPerLine;
        var blocksPerColumn = component.blocksPerColumn;
        var samplesPerLine = blocksPerLine << 3;
        var R = new Int32Array(64), r = new Uint8Array(64);
        function quantizeAndInverse(zz, dataOut, dataIn) {
          var qt = component.quantizationTable;
          var v0, v1, v2, v3, v4, v5, v6, v7, t;
          var p = dataIn;
          var i2;
          for (i2 = 0; i2 < 64; i2++)
            p[i2] = zz[i2] * qt[i2];
          for (i2 = 0; i2 < 8; ++i2) {
            var row = 8 * i2;
            if (p[1 + row] == 0 && p[2 + row] == 0 && p[3 + row] == 0 && p[4 + row] == 0 && p[5 + row] == 0 && p[6 + row] == 0 && p[7 + row] == 0) {
              t = dctSqrt2 * p[0 + row] + 512 >> 10;
              p[0 + row] = t;
              p[1 + row] = t;
              p[2 + row] = t;
              p[3 + row] = t;
              p[4 + row] = t;
              p[5 + row] = t;
              p[6 + row] = t;
              p[7 + row] = t;
              continue;
            }
            v0 = dctSqrt2 * p[0 + row] + 128 >> 8;
            v1 = dctSqrt2 * p[4 + row] + 128 >> 8;
            v2 = p[2 + row];
            v3 = p[6 + row];
            v4 = dctSqrt1d2 * (p[1 + row] - p[7 + row]) + 128 >> 8;
            v7 = dctSqrt1d2 * (p[1 + row] + p[7 + row]) + 128 >> 8;
            v5 = p[3 + row] << 4;
            v6 = p[5 + row] << 4;
            t = v0 - v1 + 1 >> 1;
            v0 = v0 + v1 + 1 >> 1;
            v1 = t;
            t = v2 * dctSin6 + v3 * dctCos6 + 128 >> 8;
            v2 = v2 * dctCos6 - v3 * dctSin6 + 128 >> 8;
            v3 = t;
            t = v4 - v6 + 1 >> 1;
            v4 = v4 + v6 + 1 >> 1;
            v6 = t;
            t = v7 + v5 + 1 >> 1;
            v5 = v7 - v5 + 1 >> 1;
            v7 = t;
            t = v0 - v3 + 1 >> 1;
            v0 = v0 + v3 + 1 >> 1;
            v3 = t;
            t = v1 - v2 + 1 >> 1;
            v1 = v1 + v2 + 1 >> 1;
            v2 = t;
            t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
            v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
            v7 = t;
            t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
            v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
            v6 = t;
            p[0 + row] = v0 + v7;
            p[7 + row] = v0 - v7;
            p[1 + row] = v1 + v6;
            p[6 + row] = v1 - v6;
            p[2 + row] = v2 + v5;
            p[5 + row] = v2 - v5;
            p[3 + row] = v3 + v4;
            p[4 + row] = v3 - v4;
          }
          for (i2 = 0; i2 < 8; ++i2) {
            var col = i2;
            if (p[1 * 8 + col] == 0 && p[2 * 8 + col] == 0 && p[3 * 8 + col] == 0 && p[4 * 8 + col] == 0 && p[5 * 8 + col] == 0 && p[6 * 8 + col] == 0 && p[7 * 8 + col] == 0) {
              t = dctSqrt2 * dataIn[i2 + 0] + 8192 >> 14;
              p[0 * 8 + col] = t;
              p[1 * 8 + col] = t;
              p[2 * 8 + col] = t;
              p[3 * 8 + col] = t;
              p[4 * 8 + col] = t;
              p[5 * 8 + col] = t;
              p[6 * 8 + col] = t;
              p[7 * 8 + col] = t;
              continue;
            }
            v0 = dctSqrt2 * p[0 * 8 + col] + 2048 >> 12;
            v1 = dctSqrt2 * p[4 * 8 + col] + 2048 >> 12;
            v2 = p[2 * 8 + col];
            v3 = p[6 * 8 + col];
            v4 = dctSqrt1d2 * (p[1 * 8 + col] - p[7 * 8 + col]) + 2048 >> 12;
            v7 = dctSqrt1d2 * (p[1 * 8 + col] + p[7 * 8 + col]) + 2048 >> 12;
            v5 = p[3 * 8 + col];
            v6 = p[5 * 8 + col];
            t = v0 - v1 + 1 >> 1;
            v0 = v0 + v1 + 1 >> 1;
            v1 = t;
            t = v2 * dctSin6 + v3 * dctCos6 + 2048 >> 12;
            v2 = v2 * dctCos6 - v3 * dctSin6 + 2048 >> 12;
            v3 = t;
            t = v4 - v6 + 1 >> 1;
            v4 = v4 + v6 + 1 >> 1;
            v6 = t;
            t = v7 + v5 + 1 >> 1;
            v5 = v7 - v5 + 1 >> 1;
            v7 = t;
            t = v0 - v3 + 1 >> 1;
            v0 = v0 + v3 + 1 >> 1;
            v3 = t;
            t = v1 - v2 + 1 >> 1;
            v1 = v1 + v2 + 1 >> 1;
            v2 = t;
            t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
            v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
            v7 = t;
            t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
            v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
            v6 = t;
            p[0 * 8 + col] = v0 + v7;
            p[7 * 8 + col] = v0 - v7;
            p[1 * 8 + col] = v1 + v6;
            p[6 * 8 + col] = v1 - v6;
            p[2 * 8 + col] = v2 + v5;
            p[5 * 8 + col] = v2 - v5;
            p[3 * 8 + col] = v3 + v4;
            p[4 * 8 + col] = v3 - v4;
          }
          for (i2 = 0; i2 < 64; ++i2) {
            var sample2 = 128 + (p[i2] + 8 >> 4);
            dataOut[i2] = sample2 < 0 ? 0 : sample2 > 255 ? 255 : sample2;
          }
        }
        requestMemoryAllocation(samplesPerLine * blocksPerColumn * 8);
        var i, j;
        for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
          var scanLine = blockRow << 3;
          for (i = 0; i < 8; i++)
            lines.push(new Uint8Array(samplesPerLine));
          for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
            quantizeAndInverse(component.blocks[blockRow][blockCol], r, R);
            var offset = 0, sample = blockCol << 3;
            for (j = 0; j < 8; j++) {
              var line = lines[scanLine + j];
              for (i = 0; i < 8; i++)
                line[sample + i] = r[offset++];
            }
          }
        }
        return lines;
      }
      function clampTo8bit(a) {
        return a < 0 ? 0 : a > 255 ? 255 : a;
      }
      constructor.prototype = {
        load: function load(path3) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", path3, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = function() {
            var data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
            this.parse(data);
            if (this.onload)
              this.onload();
          }.bind(this);
          xhr.send(null);
        },
        parse: function parse(data) {
          var maxResolutionInPixels = this.opts.maxResolutionInMP * 1e3 * 1e3;
          var offset = 0, length = data.length;
          function readUint16() {
            var value = data[offset] << 8 | data[offset + 1];
            offset += 2;
            return value;
          }
          function readDataBlock() {
            var length2 = readUint16();
            var array = data.subarray(offset, offset + length2 - 2);
            offset += array.length;
            return array;
          }
          function prepareComponents(frame2) {
            var maxH2 = 1, maxV2 = 1;
            var component2, componentId2;
            for (componentId2 in frame2.components) {
              if (frame2.components.hasOwnProperty(componentId2)) {
                component2 = frame2.components[componentId2];
                if (maxH2 < component2.h) maxH2 = component2.h;
                if (maxV2 < component2.v) maxV2 = component2.v;
              }
            }
            var mcusPerLine = Math.ceil(frame2.samplesPerLine / 8 / maxH2);
            var mcusPerColumn = Math.ceil(frame2.scanLines / 8 / maxV2);
            for (componentId2 in frame2.components) {
              if (frame2.components.hasOwnProperty(componentId2)) {
                component2 = frame2.components[componentId2];
                var blocksPerLine = Math.ceil(Math.ceil(frame2.samplesPerLine / 8) * component2.h / maxH2);
                var blocksPerColumn = Math.ceil(Math.ceil(frame2.scanLines / 8) * component2.v / maxV2);
                var blocksPerLineForMcu = mcusPerLine * component2.h;
                var blocksPerColumnForMcu = mcusPerColumn * component2.v;
                var blocksToAllocate = blocksPerColumnForMcu * blocksPerLineForMcu;
                var blocks = [];
                requestMemoryAllocation(blocksToAllocate * 256);
                for (var i2 = 0; i2 < blocksPerColumnForMcu; i2++) {
                  var row = [];
                  for (var j2 = 0; j2 < blocksPerLineForMcu; j2++)
                    row.push(new Int32Array(64));
                  blocks.push(row);
                }
                component2.blocksPerLine = blocksPerLine;
                component2.blocksPerColumn = blocksPerColumn;
                component2.blocks = blocks;
              }
            }
            frame2.maxH = maxH2;
            frame2.maxV = maxV2;
            frame2.mcusPerLine = mcusPerLine;
            frame2.mcusPerColumn = mcusPerColumn;
          }
          var jfif = null;
          var adobe = null;
          var pixels = null;
          var frame, resetInterval;
          var quantizationTables = [], frames = [];
          var huffmanTablesAC = [], huffmanTablesDC = [];
          var fileMarker = readUint16();
          var malformedDataOffset = -1;
          this.comments = [];
          if (fileMarker != 65496) {
            throw new Error("SOI not found");
          }
          fileMarker = readUint16();
          while (fileMarker != 65497) {
            var i, j, l;
            switch (fileMarker) {
              case 65280:
                break;
              case 65504:
              // APP0 (Application Specific)
              case 65505:
              // APP1
              case 65506:
              // APP2
              case 65507:
              // APP3
              case 65508:
              // APP4
              case 65509:
              // APP5
              case 65510:
              // APP6
              case 65511:
              // APP7
              case 65512:
              // APP8
              case 65513:
              // APP9
              case 65514:
              // APP10
              case 65515:
              // APP11
              case 65516:
              // APP12
              case 65517:
              // APP13
              case 65518:
              // APP14
              case 65519:
              // APP15
              case 65534:
                var appData = readDataBlock();
                if (fileMarker === 65534) {
                  var comment = String.fromCharCode.apply(null, appData);
                  this.comments.push(comment);
                }
                if (fileMarker === 65504) {
                  if (appData[0] === 74 && appData[1] === 70 && appData[2] === 73 && appData[3] === 70 && appData[4] === 0) {
                    jfif = {
                      version: { major: appData[5], minor: appData[6] },
                      densityUnits: appData[7],
                      xDensity: appData[8] << 8 | appData[9],
                      yDensity: appData[10] << 8 | appData[11],
                      thumbWidth: appData[12],
                      thumbHeight: appData[13],
                      thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
                    };
                  }
                }
                if (fileMarker === 65505) {
                  if (appData[0] === 69 && appData[1] === 120 && appData[2] === 105 && appData[3] === 102 && appData[4] === 0) {
                    this.exifBuffer = appData.subarray(5, appData.length);
                  }
                }
                if (fileMarker === 65518) {
                  if (appData[0] === 65 && appData[1] === 100 && appData[2] === 111 && appData[3] === 98 && appData[4] === 101 && appData[5] === 0) {
                    adobe = {
                      version: appData[6],
                      flags0: appData[7] << 8 | appData[8],
                      flags1: appData[9] << 8 | appData[10],
                      transformCode: appData[11]
                    };
                  }
                }
                break;
              case 65499:
                var quantizationTablesLength = readUint16();
                var quantizationTablesEnd = quantizationTablesLength + offset - 2;
                while (offset < quantizationTablesEnd) {
                  var quantizationTableSpec = data[offset++];
                  requestMemoryAllocation(64 * 4);
                  var tableData = new Int32Array(64);
                  if (quantizationTableSpec >> 4 === 0) {
                    for (j = 0; j < 64; j++) {
                      var z = dctZigZag[j];
                      tableData[z] = data[offset++];
                    }
                  } else if (quantizationTableSpec >> 4 === 1) {
                    for (j = 0; j < 64; j++) {
                      var z = dctZigZag[j];
                      tableData[z] = readUint16();
                    }
                  } else
                    throw new Error("DQT: invalid table spec");
                  quantizationTables[quantizationTableSpec & 15] = tableData;
                }
                break;
              case 65472:
              // SOF0 (Start of Frame, Baseline DCT)
              case 65473:
              // SOF1 (Start of Frame, Extended DCT)
              case 65474:
                readUint16();
                frame = {};
                frame.extended = fileMarker === 65473;
                frame.progressive = fileMarker === 65474;
                frame.precision = data[offset++];
                frame.scanLines = readUint16();
                frame.samplesPerLine = readUint16();
                frame.components = {};
                frame.componentsOrder = [];
                var pixelsInFrame = frame.scanLines * frame.samplesPerLine;
                if (pixelsInFrame > maxResolutionInPixels) {
                  var exceededAmount = Math.ceil((pixelsInFrame - maxResolutionInPixels) / 1e6);
                  throw new Error(`maxResolutionInMP limit exceeded by ${exceededAmount}MP`);
                }
                var componentsCount = data[offset++], componentId;
                var maxH = 0, maxV = 0;
                for (i = 0; i < componentsCount; i++) {
                  componentId = data[offset];
                  var h = data[offset + 1] >> 4;
                  var v = data[offset + 1] & 15;
                  var qId = data[offset + 2];
                  if (h <= 0 || v <= 0) {
                    throw new Error("Invalid sampling factor, expected values above 0");
                  }
                  frame.componentsOrder.push(componentId);
                  frame.components[componentId] = {
                    h,
                    v,
                    quantizationIdx: qId
                  };
                  offset += 3;
                }
                prepareComponents(frame);
                frames.push(frame);
                break;
              case 65476:
                var huffmanLength = readUint16();
                for (i = 2; i < huffmanLength; ) {
                  var huffmanTableSpec = data[offset++];
                  var codeLengths = new Uint8Array(16);
                  var codeLengthSum = 0;
                  for (j = 0; j < 16; j++, offset++) {
                    codeLengthSum += codeLengths[j] = data[offset];
                  }
                  requestMemoryAllocation(16 + codeLengthSum);
                  var huffmanValues = new Uint8Array(codeLengthSum);
                  for (j = 0; j < codeLengthSum; j++, offset++)
                    huffmanValues[j] = data[offset];
                  i += 17 + codeLengthSum;
                  (huffmanTableSpec >> 4 === 0 ? huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] = buildHuffmanTable(codeLengths, huffmanValues);
                }
                break;
              case 65501:
                readUint16();
                resetInterval = readUint16();
                break;
              case 65500:
                readUint16();
                readUint16();
                break;
              case 65498:
                var scanLength = readUint16();
                var selectorsCount = data[offset++];
                var components = [], component;
                for (i = 0; i < selectorsCount; i++) {
                  component = frame.components[data[offset++]];
                  var tableSpec = data[offset++];
                  component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
                  component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
                  components.push(component);
                }
                var spectralStart = data[offset++];
                var spectralEnd = data[offset++];
                var successiveApproximation = data[offset++];
                var processed = decodeScan(
                  data,
                  offset,
                  frame,
                  components,
                  resetInterval,
                  spectralStart,
                  spectralEnd,
                  successiveApproximation >> 4,
                  successiveApproximation & 15,
                  this.opts
                );
                offset += processed;
                break;
              case 65535:
                if (data[offset] !== 255) {
                  offset--;
                }
                break;
              default:
                if (data[offset - 3] == 255 && data[offset - 2] >= 192 && data[offset - 2] <= 254) {
                  offset -= 3;
                  break;
                } else if (fileMarker === 224 || fileMarker == 225) {
                  if (malformedDataOffset !== -1) {
                    throw new Error(`first unknown JPEG marker at offset ${malformedDataOffset.toString(16)}, second unknown JPEG marker ${fileMarker.toString(16)} at offset ${(offset - 1).toString(16)}`);
                  }
                  malformedDataOffset = offset - 1;
                  const nextOffset = readUint16();
                  if (data[offset + nextOffset - 2] === 255) {
                    offset += nextOffset - 2;
                    break;
                  }
                }
                throw new Error("unknown JPEG marker " + fileMarker.toString(16));
            }
            fileMarker = readUint16();
          }
          if (frames.length != 1)
            throw new Error("only single frame JPEGs supported");
          for (var i = 0; i < frames.length; i++) {
            var cp = frames[i].components;
            for (var j in cp) {
              cp[j].quantizationTable = quantizationTables[cp[j].quantizationIdx];
              delete cp[j].quantizationIdx;
            }
          }
          this.width = frame.samplesPerLine;
          this.height = frame.scanLines;
          this.jfif = jfif;
          this.adobe = adobe;
          this.components = [];
          for (var i = 0; i < frame.componentsOrder.length; i++) {
            var component = frame.components[frame.componentsOrder[i]];
            this.components.push({
              lines: buildComponentData(frame, component),
              scaleX: component.h / frame.maxH,
              scaleY: component.v / frame.maxV
            });
          }
        },
        getData: function getData(width, height) {
          var scaleX = this.width / width, scaleY = this.height / height;
          var component1, component2, component3, component4;
          var component1Line, component2Line, component3Line, component4Line;
          var x, y;
          var offset = 0;
          var Y, Cb, Cr, K, C, M, Ye, R, G, B;
          var colorTransform;
          var dataLength = width * height * this.components.length;
          requestMemoryAllocation(dataLength);
          var data = new Uint8Array(dataLength);
          switch (this.components.length) {
            case 1:
              component1 = this.components[0];
              for (y = 0; y < height; y++) {
                component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  Y = component1Line[0 | x * component1.scaleX * scaleX];
                  data[offset++] = Y;
                }
              }
              break;
            case 2:
              component1 = this.components[0];
              component2 = this.components[1];
              for (y = 0; y < height; y++) {
                component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
                component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  Y = component1Line[0 | x * component1.scaleX * scaleX];
                  data[offset++] = Y;
                  Y = component2Line[0 | x * component2.scaleX * scaleX];
                  data[offset++] = Y;
                }
              }
              break;
            case 3:
              colorTransform = true;
              if (this.adobe && this.adobe.transformCode)
                colorTransform = true;
              else if (typeof this.opts.colorTransform !== "undefined")
                colorTransform = !!this.opts.colorTransform;
              component1 = this.components[0];
              component2 = this.components[1];
              component3 = this.components[2];
              for (y = 0; y < height; y++) {
                component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
                component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
                component3Line = component3.lines[0 | y * component3.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  if (!colorTransform) {
                    R = component1Line[0 | x * component1.scaleX * scaleX];
                    G = component2Line[0 | x * component2.scaleX * scaleX];
                    B = component3Line[0 | x * component3.scaleX * scaleX];
                  } else {
                    Y = component1Line[0 | x * component1.scaleX * scaleX];
                    Cb = component2Line[0 | x * component2.scaleX * scaleX];
                    Cr = component3Line[0 | x * component3.scaleX * scaleX];
                    R = clampTo8bit(Y + 1.402 * (Cr - 128));
                    G = clampTo8bit(Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
                    B = clampTo8bit(Y + 1.772 * (Cb - 128));
                  }
                  data[offset++] = R;
                  data[offset++] = G;
                  data[offset++] = B;
                }
              }
              break;
            case 4:
              if (!this.adobe)
                throw new Error("Unsupported color mode (4 components)");
              colorTransform = false;
              if (this.adobe && this.adobe.transformCode)
                colorTransform = true;
              else if (typeof this.opts.colorTransform !== "undefined")
                colorTransform = !!this.opts.colorTransform;
              component1 = this.components[0];
              component2 = this.components[1];
              component3 = this.components[2];
              component4 = this.components[3];
              for (y = 0; y < height; y++) {
                component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
                component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
                component3Line = component3.lines[0 | y * component3.scaleY * scaleY];
                component4Line = component4.lines[0 | y * component4.scaleY * scaleY];
                for (x = 0; x < width; x++) {
                  if (!colorTransform) {
                    C = component1Line[0 | x * component1.scaleX * scaleX];
                    M = component2Line[0 | x * component2.scaleX * scaleX];
                    Ye = component3Line[0 | x * component3.scaleX * scaleX];
                    K = component4Line[0 | x * component4.scaleX * scaleX];
                  } else {
                    Y = component1Line[0 | x * component1.scaleX * scaleX];
                    Cb = component2Line[0 | x * component2.scaleX * scaleX];
                    Cr = component3Line[0 | x * component3.scaleX * scaleX];
                    K = component4Line[0 | x * component4.scaleX * scaleX];
                    C = 255 - clampTo8bit(Y + 1.402 * (Cr - 128));
                    M = 255 - clampTo8bit(Y - 0.3441363 * (Cb - 128) - 0.71413636 * (Cr - 128));
                    Ye = 255 - clampTo8bit(Y + 1.772 * (Cb - 128));
                  }
                  data[offset++] = 255 - C;
                  data[offset++] = 255 - M;
                  data[offset++] = 255 - Ye;
                  data[offset++] = 255 - K;
                }
              }
              break;
            default:
              throw new Error("Unsupported color mode");
          }
          return data;
        },
        copyToImageData: function copyToImageData(imageData, formatAsRGBA) {
          var width = imageData.width, height = imageData.height;
          var imageDataArray = imageData.data;
          var data = this.getData(width, height);
          var i = 0, j = 0, x, y;
          var Y, K, C, M, R, G, B;
          switch (this.components.length) {
            case 1:
              for (y = 0; y < height; y++) {
                for (x = 0; x < width; x++) {
                  Y = data[i++];
                  imageDataArray[j++] = Y;
                  imageDataArray[j++] = Y;
                  imageDataArray[j++] = Y;
                  if (formatAsRGBA) {
                    imageDataArray[j++] = 255;
                  }
                }
              }
              break;
            case 3:
              for (y = 0; y < height; y++) {
                for (x = 0; x < width; x++) {
                  R = data[i++];
                  G = data[i++];
                  B = data[i++];
                  imageDataArray[j++] = R;
                  imageDataArray[j++] = G;
                  imageDataArray[j++] = B;
                  if (formatAsRGBA) {
                    imageDataArray[j++] = 255;
                  }
                }
              }
              break;
            case 4:
              for (y = 0; y < height; y++) {
                for (x = 0; x < width; x++) {
                  C = data[i++];
                  M = data[i++];
                  Y = data[i++];
                  K = data[i++];
                  R = 255 - clampTo8bit(C * (1 - K / 255) + K);
                  G = 255 - clampTo8bit(M * (1 - K / 255) + K);
                  B = 255 - clampTo8bit(Y * (1 - K / 255) + K);
                  imageDataArray[j++] = R;
                  imageDataArray[j++] = G;
                  imageDataArray[j++] = B;
                  if (formatAsRGBA) {
                    imageDataArray[j++] = 255;
                  }
                }
              }
              break;
            default:
              throw new Error("Unsupported color mode");
          }
        }
      };
      var totalBytesAllocated = 0;
      var maxMemoryUsageBytes = 0;
      function requestMemoryAllocation(increaseAmount = 0) {
        var totalMemoryImpactBytes = totalBytesAllocated + increaseAmount;
        if (totalMemoryImpactBytes > maxMemoryUsageBytes) {
          var exceededAmount = Math.ceil((totalMemoryImpactBytes - maxMemoryUsageBytes) / 1024 / 1024);
          throw new Error(`maxMemoryUsageInMB limit exceeded by at least ${exceededAmount}MB`);
        }
        totalBytesAllocated = totalMemoryImpactBytes;
      }
      constructor.resetMaxMemoryUsage = function(maxMemoryUsageBytes_) {
        totalBytesAllocated = 0;
        maxMemoryUsageBytes = maxMemoryUsageBytes_;
      };
      constructor.getBytesAllocated = function() {
        return totalBytesAllocated;
      };
      constructor.requestMemoryAllocation = requestMemoryAllocation;
      return constructor;
    }();
    if (typeof module !== "undefined") {
      module.exports = decode;
    } else if (typeof window !== "undefined") {
      window["jpeg-js"] = window["jpeg-js"] || {};
      window["jpeg-js"].decode = decode;
    }
    function decode(jpegData, userOpts = {}) {
      var defaultOpts = {
        // "undefined" means "Choose whether to transform colors based on the image’s color model."
        colorTransform: void 0,
        useTArray: false,
        formatAsRGBA: true,
        tolerantDecoding: true,
        maxResolutionInMP: 100,
        // Don't decode more than 100 megapixels
        maxMemoryUsageInMB: 512
        // Don't decode if memory footprint is more than 512MB
      };
      var opts = { ...defaultOpts, ...userOpts };
      var arr = new Uint8Array(jpegData);
      var decoder = new JpegImage();
      decoder.opts = opts;
      JpegImage.resetMaxMemoryUsage(opts.maxMemoryUsageInMB * 1024 * 1024);
      decoder.parse(arr);
      var channels = opts.formatAsRGBA ? 4 : 3;
      var bytesNeeded = decoder.width * decoder.height * channels;
      try {
        JpegImage.requestMemoryAllocation(bytesNeeded);
        var image = {
          width: decoder.width,
          height: decoder.height,
          exifBuffer: decoder.exifBuffer,
          data: opts.useTArray ? new Uint8Array(bytesNeeded) : Buffer.alloc(bytesNeeded)
        };
        if (decoder.comments.length > 0) {
          image["comments"] = decoder.comments;
        }
      } catch (err) {
        if (err instanceof RangeError) {
          throw new Error("Could not allocate enough memory for the image. Required: " + bytesNeeded);
        }
        if (err instanceof ReferenceError) {
          if (err.message === "Buffer is not defined") {
            throw new Error("Buffer is not globally defined in this environment. Consider setting useTArray to true");
          }
        }
        throw err;
      }
      decoder.copyToImageData(image, opts.formatAsRGBA);
      return image;
    }
  }
});

// node_modules/jpeg-js/index.js
var require_jpeg_js = __commonJS({
  "node_modules/jpeg-js/index.js"(exports, module) {
    var encode = require_encoder();
    var decode = require_decoder();
    module.exports = {
      encode,
      decode
    };
  }
});

// node_modules/pngjs/lib/chunkstream.js
var require_chunkstream = __commonJS({
  "node_modules/pngjs/lib/chunkstream.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var ChunkStream = module.exports = function() {
      Stream.call(this);
      this._buffers = [];
      this._buffered = 0;
      this._reads = [];
      this._paused = false;
      this._encoding = "utf8";
      this.writable = true;
    };
    util.inherits(ChunkStream, Stream);
    ChunkStream.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
      process.nextTick(
        function() {
          this._process();
          if (this._paused && this._reads && this._reads.length > 0) {
            this._paused = false;
            this.emit("drain");
          }
        }.bind(this)
      );
    };
    ChunkStream.prototype.write = function(data, encoding) {
      if (!this.writable) {
        this.emit("error", new Error("Stream not writable"));
        return false;
      }
      let dataBuffer;
      if (Buffer.isBuffer(data)) {
        dataBuffer = data;
      } else {
        dataBuffer = Buffer.from(data, encoding || this._encoding);
      }
      this._buffers.push(dataBuffer);
      this._buffered += dataBuffer.length;
      this._process();
      if (this._reads && this._reads.length === 0) {
        this._paused = true;
      }
      return this.writable && !this._paused;
    };
    ChunkStream.prototype.end = function(data, encoding) {
      if (data) {
        this.write(data, encoding);
      }
      this.writable = false;
      if (!this._buffers) {
        return;
      }
      if (this._buffers.length === 0) {
        this._end();
      } else {
        this._buffers.push(null);
        this._process();
      }
    };
    ChunkStream.prototype.destroySoon = ChunkStream.prototype.end;
    ChunkStream.prototype._end = function() {
      if (this._reads.length > 0) {
        this.emit("error", new Error("Unexpected end of input"));
      }
      this.destroy();
    };
    ChunkStream.prototype.destroy = function() {
      if (!this._buffers) {
        return;
      }
      this.writable = false;
      this._reads = null;
      this._buffers = null;
      this.emit("close");
    };
    ChunkStream.prototype._processReadAllowingLess = function(read) {
      this._reads.shift();
      let smallerBuf = this._buffers[0];
      if (smallerBuf.length > read.length) {
        this._buffered -= read.length;
        this._buffers[0] = smallerBuf.slice(read.length);
        read.func.call(this, smallerBuf.slice(0, read.length));
      } else {
        this._buffered -= smallerBuf.length;
        this._buffers.shift();
        read.func.call(this, smallerBuf);
      }
    };
    ChunkStream.prototype._processRead = function(read) {
      this._reads.shift();
      let pos = 0;
      let count = 0;
      let data = Buffer.alloc(read.length);
      while (pos < read.length) {
        let buf = this._buffers[count++];
        let len = Math.min(buf.length, read.length - pos);
        buf.copy(data, pos, 0, len);
        pos += len;
        if (len !== buf.length) {
          this._buffers[--count] = buf.slice(len);
        }
      }
      if (count > 0) {
        this._buffers.splice(0, count);
      }
      this._buffered -= read.length;
      read.func.call(this, data);
    };
    ChunkStream.prototype._process = function() {
      try {
        while (this._buffered > 0 && this._reads && this._reads.length > 0) {
          let read = this._reads[0];
          if (read.allowLess) {
            this._processReadAllowingLess(read);
          } else if (this._buffered >= read.length) {
            this._processRead(read);
          } else {
            break;
          }
        }
        if (this._buffers && !this.writable) {
          this._end();
        }
      } catch (ex) {
        this.emit("error", ex);
      }
    };
  }
});

// node_modules/pngjs/lib/interlace.js
var require_interlace = __commonJS({
  "node_modules/pngjs/lib/interlace.js"(exports) {
    "use strict";
    var imagePasses = [
      {
        // pass 1 - 1px
        x: [0],
        y: [0]
      },
      {
        // pass 2 - 1px
        x: [4],
        y: [0]
      },
      {
        // pass 3 - 2px
        x: [0, 4],
        y: [4]
      },
      {
        // pass 4 - 4px
        x: [2, 6],
        y: [0, 4]
      },
      {
        // pass 5 - 8px
        x: [0, 2, 4, 6],
        y: [2, 6]
      },
      {
        // pass 6 - 16px
        x: [1, 3, 5, 7],
        y: [0, 2, 4, 6]
      },
      {
        // pass 7 - 32px
        x: [0, 1, 2, 3, 4, 5, 6, 7],
        y: [1, 3, 5, 7]
      }
    ];
    exports.getImagePasses = function(width, height) {
      let images = [];
      let xLeftOver = width % 8;
      let yLeftOver = height % 8;
      let xRepeats = (width - xLeftOver) / 8;
      let yRepeats = (height - yLeftOver) / 8;
      for (let i = 0; i < imagePasses.length; i++) {
        let pass = imagePasses[i];
        let passWidth = xRepeats * pass.x.length;
        let passHeight = yRepeats * pass.y.length;
        for (let j = 0; j < pass.x.length; j++) {
          if (pass.x[j] < xLeftOver) {
            passWidth++;
          } else {
            break;
          }
        }
        for (let j = 0; j < pass.y.length; j++) {
          if (pass.y[j] < yLeftOver) {
            passHeight++;
          } else {
            break;
          }
        }
        if (passWidth > 0 && passHeight > 0) {
          images.push({ width: passWidth, height: passHeight, index: i });
        }
      }
      return images;
    };
    exports.getInterlaceIterator = function(width) {
      return function(x, y, pass) {
        let outerXLeftOver = x % imagePasses[pass].x.length;
        let outerX = (x - outerXLeftOver) / imagePasses[pass].x.length * 8 + imagePasses[pass].x[outerXLeftOver];
        let outerYLeftOver = y % imagePasses[pass].y.length;
        let outerY = (y - outerYLeftOver) / imagePasses[pass].y.length * 8 + imagePasses[pass].y[outerYLeftOver];
        return outerX * 4 + outerY * width * 4;
      };
    };
  }
});

// node_modules/pngjs/lib/paeth-predictor.js
var require_paeth_predictor = __commonJS({
  "node_modules/pngjs/lib/paeth-predictor.js"(exports, module) {
    "use strict";
    module.exports = function paethPredictor(left, above, upLeft) {
      let paeth = left + above - upLeft;
      let pLeft = Math.abs(paeth - left);
      let pAbove = Math.abs(paeth - above);
      let pUpLeft = Math.abs(paeth - upLeft);
      if (pLeft <= pAbove && pLeft <= pUpLeft) {
        return left;
      }
      if (pAbove <= pUpLeft) {
        return above;
      }
      return upLeft;
    };
  }
});

// node_modules/pngjs/lib/filter-parse.js
var require_filter_parse = __commonJS({
  "node_modules/pngjs/lib/filter-parse.js"(exports, module) {
    "use strict";
    var interlaceUtils = require_interlace();
    var paethPredictor = require_paeth_predictor();
    function getByteWidth(width, bpp, depth) {
      let byteWidth = width * bpp;
      if (depth !== 8) {
        byteWidth = Math.ceil(byteWidth / (8 / depth));
      }
      return byteWidth;
    }
    var Filter = module.exports = function(bitmapInfo, dependencies) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let interlace = bitmapInfo.interlace;
      let bpp = bitmapInfo.bpp;
      let depth = bitmapInfo.depth;
      this.read = dependencies.read;
      this.write = dependencies.write;
      this.complete = dependencies.complete;
      this._imageIndex = 0;
      this._images = [];
      if (interlace) {
        let passes = interlaceUtils.getImagePasses(width, height);
        for (let i = 0; i < passes.length; i++) {
          this._images.push({
            byteWidth: getByteWidth(passes[i].width, bpp, depth),
            height: passes[i].height,
            lineIndex: 0
          });
        }
      } else {
        this._images.push({
          byteWidth: getByteWidth(width, bpp, depth),
          height,
          lineIndex: 0
        });
      }
      if (depth === 8) {
        this._xComparison = bpp;
      } else if (depth === 16) {
        this._xComparison = bpp * 2;
      } else {
        this._xComparison = 1;
      }
    };
    Filter.prototype.start = function() {
      this.read(
        this._images[this._imageIndex].byteWidth + 1,
        this._reverseFilterLine.bind(this)
      );
    };
    Filter.prototype._unFilterType1 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f1Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        unfilteredLine[x] = rawByte + f1Left;
      }
    };
    Filter.prototype._unFilterType2 = function(rawData, unfilteredLine, byteWidth) {
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f2Up = lastLine ? lastLine[x] : 0;
        unfilteredLine[x] = rawByte + f2Up;
      }
    };
    Filter.prototype._unFilterType3 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f3Up = lastLine ? lastLine[x] : 0;
        let f3Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f3Add = Math.floor((f3Left + f3Up) / 2);
        unfilteredLine[x] = rawByte + f3Add;
      }
    };
    Filter.prototype._unFilterType4 = function(rawData, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData[1 + x];
        let f4Up = lastLine ? lastLine[x] : 0;
        let f4Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f4UpLeft = x > xBiggerThan && lastLine ? lastLine[x - xComparison] : 0;
        let f4Add = paethPredictor(f4Left, f4Up, f4UpLeft);
        unfilteredLine[x] = rawByte + f4Add;
      }
    };
    Filter.prototype._reverseFilterLine = function(rawData) {
      let filter = rawData[0];
      let unfilteredLine;
      let currentImage = this._images[this._imageIndex];
      let byteWidth = currentImage.byteWidth;
      if (filter === 0) {
        unfilteredLine = rawData.slice(1, byteWidth + 1);
      } else {
        unfilteredLine = Buffer.alloc(byteWidth);
        switch (filter) {
          case 1:
            this._unFilterType1(rawData, unfilteredLine, byteWidth);
            break;
          case 2:
            this._unFilterType2(rawData, unfilteredLine, byteWidth);
            break;
          case 3:
            this._unFilterType3(rawData, unfilteredLine, byteWidth);
            break;
          case 4:
            this._unFilterType4(rawData, unfilteredLine, byteWidth);
            break;
          default:
            throw new Error("Unrecognised filter type - " + filter);
        }
      }
      this.write(unfilteredLine);
      currentImage.lineIndex++;
      if (currentImage.lineIndex >= currentImage.height) {
        this._lastLine = null;
        this._imageIndex++;
        currentImage = this._images[this._imageIndex];
      } else {
        this._lastLine = unfilteredLine;
      }
      if (currentImage) {
        this.read(currentImage.byteWidth + 1, this._reverseFilterLine.bind(this));
      } else {
        this._lastLine = null;
        this.complete();
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-async.js
var require_filter_parse_async = __commonJS({
  "node_modules/pngjs/lib/filter-parse-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var ChunkStream = require_chunkstream();
    var Filter = require_filter_parse();
    var FilterAsync = module.exports = function(bitmapInfo) {
      ChunkStream.call(this);
      let buffers = [];
      let that = this;
      this._filter = new Filter(bitmapInfo, {
        read: this.read.bind(this),
        write: function(buffer) {
          buffers.push(buffer);
        },
        complete: function() {
          that.emit("complete", Buffer.concat(buffers));
        }
      });
      this._filter.start();
    };
    util.inherits(FilterAsync, ChunkStream);
  }
});

// node_modules/pngjs/lib/constants.js
var require_constants = __commonJS({
  "node_modules/pngjs/lib/constants.js"(exports, module) {
    "use strict";
    module.exports = {
      PNG_SIGNATURE: [137, 80, 78, 71, 13, 10, 26, 10],
      TYPE_IHDR: 1229472850,
      TYPE_IEND: 1229278788,
      TYPE_IDAT: 1229209940,
      TYPE_PLTE: 1347179589,
      TYPE_tRNS: 1951551059,
      // eslint-disable-line camelcase
      TYPE_gAMA: 1732332865,
      // eslint-disable-line camelcase
      // color-type bits
      COLORTYPE_GRAYSCALE: 0,
      COLORTYPE_PALETTE: 1,
      COLORTYPE_COLOR: 2,
      COLORTYPE_ALPHA: 4,
      // e.g. grayscale and alpha
      // color-type combinations
      COLORTYPE_PALETTE_COLOR: 3,
      COLORTYPE_COLOR_ALPHA: 6,
      COLORTYPE_TO_BPP_MAP: {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
      },
      GAMMA_DIVISION: 1e5
    };
  }
});

// node_modules/pngjs/lib/crc.js
var require_crc = __commonJS({
  "node_modules/pngjs/lib/crc.js"(exports, module) {
    "use strict";
    var crcTable = [];
    (function() {
      for (let i = 0; i < 256; i++) {
        let currentCrc = i;
        for (let j = 0; j < 8; j++) {
          if (currentCrc & 1) {
            currentCrc = 3988292384 ^ currentCrc >>> 1;
          } else {
            currentCrc = currentCrc >>> 1;
          }
        }
        crcTable[i] = currentCrc;
      }
    })();
    var CrcCalculator = module.exports = function() {
      this._crc = -1;
    };
    CrcCalculator.prototype.write = function(data) {
      for (let i = 0; i < data.length; i++) {
        this._crc = crcTable[(this._crc ^ data[i]) & 255] ^ this._crc >>> 8;
      }
      return true;
    };
    CrcCalculator.prototype.crc32 = function() {
      return this._crc ^ -1;
    };
    CrcCalculator.crc32 = function(buf) {
      let crc = -1;
      for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 255] ^ crc >>> 8;
      }
      return crc ^ -1;
    };
  }
});

// node_modules/pngjs/lib/parser.js
var require_parser = __commonJS({
  "node_modules/pngjs/lib/parser.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var CrcCalculator = require_crc();
    var Parser = module.exports = function(options, dependencies) {
      this._options = options;
      options.checkCRC = options.checkCRC !== false;
      this._hasIHDR = false;
      this._hasIEND = false;
      this._emittedHeadersFinished = false;
      this._palette = [];
      this._colorType = 0;
      this._chunks = {};
      this._chunks[constants.TYPE_IHDR] = this._handleIHDR.bind(this);
      this._chunks[constants.TYPE_IEND] = this._handleIEND.bind(this);
      this._chunks[constants.TYPE_IDAT] = this._handleIDAT.bind(this);
      this._chunks[constants.TYPE_PLTE] = this._handlePLTE.bind(this);
      this._chunks[constants.TYPE_tRNS] = this._handleTRNS.bind(this);
      this._chunks[constants.TYPE_gAMA] = this._handleGAMA.bind(this);
      this.read = dependencies.read;
      this.error = dependencies.error;
      this.metadata = dependencies.metadata;
      this.gamma = dependencies.gamma;
      this.transColor = dependencies.transColor;
      this.palette = dependencies.palette;
      this.parsed = dependencies.parsed;
      this.inflateData = dependencies.inflateData;
      this.finished = dependencies.finished;
      this.simpleTransparency = dependencies.simpleTransparency;
      this.headersFinished = dependencies.headersFinished || function() {
      };
    };
    Parser.prototype.start = function() {
      this.read(constants.PNG_SIGNATURE.length, this._parseSignature.bind(this));
    };
    Parser.prototype._parseSignature = function(data) {
      let signature = constants.PNG_SIGNATURE;
      for (let i = 0; i < signature.length; i++) {
        if (data[i] !== signature[i]) {
          this.error(new Error("Invalid file signature"));
          return;
        }
      }
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._parseChunkBegin = function(data) {
      let length = data.readUInt32BE(0);
      let type = data.readUInt32BE(4);
      let name = "";
      for (let i = 4; i < 8; i++) {
        name += String.fromCharCode(data[i]);
      }
      let ancillary = Boolean(data[4] & 32);
      if (!this._hasIHDR && type !== constants.TYPE_IHDR) {
        this.error(new Error("Expected IHDR on beggining"));
        return;
      }
      this._crc = new CrcCalculator();
      this._crc.write(Buffer.from(name));
      if (this._chunks[type]) {
        return this._chunks[type](length);
      }
      if (!ancillary) {
        this.error(new Error("Unsupported critical chunk type " + name));
        return;
      }
      this.read(length + 4, this._skipChunk.bind(this));
    };
    Parser.prototype._skipChunk = function() {
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser.prototype._handleChunkEnd = function() {
      this.read(4, this._parseChunkEnd.bind(this));
    };
    Parser.prototype._parseChunkEnd = function(data) {
      let fileCrc = data.readInt32BE(0);
      let calcCrc = this._crc.crc32();
      if (this._options.checkCRC && calcCrc !== fileCrc) {
        this.error(new Error("Crc error - " + fileCrc + " - " + calcCrc));
        return;
      }
      if (!this._hasIEND) {
        this.read(8, this._parseChunkBegin.bind(this));
      }
    };
    Parser.prototype._handleIHDR = function(length) {
      this.read(length, this._parseIHDR.bind(this));
    };
    Parser.prototype._parseIHDR = function(data) {
      this._crc.write(data);
      let width = data.readUInt32BE(0);
      let height = data.readUInt32BE(4);
      let depth = data[8];
      let colorType = data[9];
      let compr = data[10];
      let filter = data[11];
      let interlace = data[12];
      if (depth !== 8 && depth !== 4 && depth !== 2 && depth !== 1 && depth !== 16) {
        this.error(new Error("Unsupported bit depth " + depth));
        return;
      }
      if (!(colorType in constants.COLORTYPE_TO_BPP_MAP)) {
        this.error(new Error("Unsupported color type"));
        return;
      }
      if (compr !== 0) {
        this.error(new Error("Unsupported compression method"));
        return;
      }
      if (filter !== 0) {
        this.error(new Error("Unsupported filter method"));
        return;
      }
      if (interlace !== 0 && interlace !== 1) {
        this.error(new Error("Unsupported interlace method"));
        return;
      }
      this._colorType = colorType;
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._colorType];
      this._hasIHDR = true;
      this.metadata({
        width,
        height,
        depth,
        interlace: Boolean(interlace),
        palette: Boolean(colorType & constants.COLORTYPE_PALETTE),
        color: Boolean(colorType & constants.COLORTYPE_COLOR),
        alpha: Boolean(colorType & constants.COLORTYPE_ALPHA),
        bpp,
        colorType
      });
      this._handleChunkEnd();
    };
    Parser.prototype._handlePLTE = function(length) {
      this.read(length, this._parsePLTE.bind(this));
    };
    Parser.prototype._parsePLTE = function(data) {
      this._crc.write(data);
      let entries = Math.floor(data.length / 3);
      for (let i = 0; i < entries; i++) {
        this._palette.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2], 255]);
      }
      this.palette(this._palette);
      this._handleChunkEnd();
    };
    Parser.prototype._handleTRNS = function(length) {
      this.simpleTransparency();
      this.read(length, this._parseTRNS.bind(this));
    };
    Parser.prototype._parseTRNS = function(data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR) {
        if (this._palette.length === 0) {
          this.error(new Error("Transparency chunk must be after palette"));
          return;
        }
        if (data.length > this._palette.length) {
          this.error(new Error("More transparent colors than palette size"));
          return;
        }
        for (let i = 0; i < data.length; i++) {
          this._palette[i][3] = data[i];
        }
        this.palette(this._palette);
      }
      if (this._colorType === constants.COLORTYPE_GRAYSCALE) {
        this.transColor([data.readUInt16BE(0)]);
      }
      if (this._colorType === constants.COLORTYPE_COLOR) {
        this.transColor([
          data.readUInt16BE(0),
          data.readUInt16BE(2),
          data.readUInt16BE(4)
        ]);
      }
      this._handleChunkEnd();
    };
    Parser.prototype._handleGAMA = function(length) {
      this.read(length, this._parseGAMA.bind(this));
    };
    Parser.prototype._parseGAMA = function(data) {
      this._crc.write(data);
      this.gamma(data.readUInt32BE(0) / constants.GAMMA_DIVISION);
      this._handleChunkEnd();
    };
    Parser.prototype._handleIDAT = function(length) {
      if (!this._emittedHeadersFinished) {
        this._emittedHeadersFinished = true;
        this.headersFinished();
      }
      this.read(-length, this._parseIDAT.bind(this, length));
    };
    Parser.prototype._parseIDAT = function(length, data) {
      this._crc.write(data);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR && this._palette.length === 0) {
        throw new Error("Expected palette not found");
      }
      this.inflateData(data);
      let leftOverLength = length - data.length;
      if (leftOverLength > 0) {
        this._handleIDAT(leftOverLength);
      } else {
        this._handleChunkEnd();
      }
    };
    Parser.prototype._handleIEND = function(length) {
      this.read(length, this._parseIEND.bind(this));
    };
    Parser.prototype._parseIEND = function(data) {
      this._crc.write(data);
      this._hasIEND = true;
      this._handleChunkEnd();
      if (this.finished) {
        this.finished();
      }
    };
  }
});

// node_modules/pngjs/lib/bitmapper.js
var require_bitmapper = __commonJS({
  "node_modules/pngjs/lib/bitmapper.js"(exports) {
    "use strict";
    var interlaceUtils = require_interlace();
    var pixelBppMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos === data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = 255;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 1 >= data.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = data[rawPos + 1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 2 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = 255;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, data, pxPos, rawPos) {
        if (rawPos + 3 >= data.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data[rawPos];
        pxData[pxPos + 1] = data[rawPos + 1];
        pxData[pxPos + 2] = data[rawPos + 2];
        pxData[pxPos + 3] = data[rawPos + 3];
      }
    ];
    var pixelBppCustomMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = maxBit;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, pixelData, pxPos) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = pixelData[1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = maxBit;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, pixelData, pxPos) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = pixelData[3];
      }
    ];
    function bitRetriever(data, depth) {
      let leftOver = [];
      let i = 0;
      function split() {
        if (i === data.length) {
          throw new Error("Ran out of data");
        }
        let byte = data[i];
        i++;
        let byte8, byte7, byte6, byte5, byte4, byte3, byte2, byte1;
        switch (depth) {
          default:
            throw new Error("unrecognised depth");
          case 16:
            byte2 = data[i];
            i++;
            leftOver.push((byte << 8) + byte2);
            break;
          case 4:
            byte2 = byte & 15;
            byte1 = byte >> 4;
            leftOver.push(byte1, byte2);
            break;
          case 2:
            byte4 = byte & 3;
            byte3 = byte >> 2 & 3;
            byte2 = byte >> 4 & 3;
            byte1 = byte >> 6 & 3;
            leftOver.push(byte1, byte2, byte3, byte4);
            break;
          case 1:
            byte8 = byte & 1;
            byte7 = byte >> 1 & 1;
            byte6 = byte >> 2 & 1;
            byte5 = byte >> 3 & 1;
            byte4 = byte >> 4 & 1;
            byte3 = byte >> 5 & 1;
            byte2 = byte >> 6 & 1;
            byte1 = byte >> 7 & 1;
            leftOver.push(byte1, byte2, byte3, byte4, byte5, byte6, byte7, byte8);
            break;
        }
      }
      return {
        get: function(count) {
          while (leftOver.length < count) {
            split();
          }
          let returner = leftOver.slice(0, count);
          leftOver = leftOver.slice(count);
          return returner;
        },
        resetAfterLine: function() {
          leftOver.length = 0;
        },
        end: function() {
          if (i !== data.length) {
            throw new Error("extra data found");
          }
        }
      };
    }
    function mapImage8Bit(image, pxData, getPxPos, bpp, data, rawPos) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppMapper[bpp](pxData, data, pxPos, rawPos);
          rawPos += bpp;
        }
      }
      return rawPos;
    }
    function mapImageCustomBit(image, pxData, getPxPos, bpp, bits, maxBit) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pixelData = bits.get(bpp);
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppCustomMapper[bpp](pxData, pixelData, pxPos, maxBit);
        }
        bits.resetAfterLine();
      }
    }
    exports.dataToBitMap = function(data, bitmapInfo) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let depth = bitmapInfo.depth;
      let bpp = bitmapInfo.bpp;
      let interlace = bitmapInfo.interlace;
      let bits;
      if (depth !== 8) {
        bits = bitRetriever(data, depth);
      }
      let pxData;
      if (depth <= 8) {
        pxData = Buffer.alloc(width * height * 4);
      } else {
        pxData = new Uint16Array(width * height * 4);
      }
      let maxBit = Math.pow(2, depth) - 1;
      let rawPos = 0;
      let images;
      let getPxPos;
      if (interlace) {
        images = interlaceUtils.getImagePasses(width, height);
        getPxPos = interlaceUtils.getInterlaceIterator(width, height);
      } else {
        let nonInterlacedPxPos = 0;
        getPxPos = function() {
          let returner = nonInterlacedPxPos;
          nonInterlacedPxPos += 4;
          return returner;
        };
        images = [{ width, height }];
      }
      for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
        if (depth === 8) {
          rawPos = mapImage8Bit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            data,
            rawPos
          );
        } else {
          mapImageCustomBit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            bits,
            maxBit
          );
        }
      }
      if (depth === 8) {
        if (rawPos !== data.length) {
          throw new Error("extra data found");
        }
      } else {
        bits.end();
      }
      return pxData;
    };
  }
});

// node_modules/pngjs/lib/format-normaliser.js
var require_format_normaliser = __commonJS({
  "node_modules/pngjs/lib/format-normaliser.js"(exports, module) {
    "use strict";
    function dePalette(indata, outdata, width, height, palette) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let color = palette[indata[pxPos]];
          if (!color) {
            throw new Error("index " + indata[pxPos] + " not in palette");
          }
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = color[i];
          }
          pxPos += 4;
        }
      }
    }
    function replaceTransparentColor(indata, outdata, width, height, transColor) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let makeTrans = false;
          if (transColor.length === 1) {
            if (transColor[0] === indata[pxPos]) {
              makeTrans = true;
            }
          } else if (transColor[0] === indata[pxPos] && transColor[1] === indata[pxPos + 1] && transColor[2] === indata[pxPos + 2]) {
            makeTrans = true;
          }
          if (makeTrans) {
            for (let i = 0; i < 4; i++) {
              outdata[pxPos + i] = 0;
            }
          }
          pxPos += 4;
        }
      }
    }
    function scaleDepth(indata, outdata, width, height, depth) {
      let maxOutSample = 255;
      let maxInSample = Math.pow(2, depth) - 1;
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = Math.floor(
              indata[pxPos + i] * maxOutSample / maxInSample + 0.5
            );
          }
          pxPos += 4;
        }
      }
    }
    module.exports = function(indata, imageData, skipRescale = false) {
      let depth = imageData.depth;
      let width = imageData.width;
      let height = imageData.height;
      let colorType = imageData.colorType;
      let transColor = imageData.transColor;
      let palette = imageData.palette;
      let outdata = indata;
      if (colorType === 3) {
        dePalette(indata, outdata, width, height, palette);
      } else {
        if (transColor) {
          replaceTransparentColor(indata, outdata, width, height, transColor);
        }
        if (depth !== 8 && !skipRescale) {
          if (depth === 16) {
            outdata = Buffer.alloc(width * height * 4);
          }
          scaleDepth(indata, outdata, width, height, depth);
        }
      }
      return outdata;
    };
  }
});

// node_modules/pngjs/lib/parser-async.js
var require_parser_async = __commonJS({
  "node_modules/pngjs/lib/parser-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var zlib = __require("zlib");
    var ChunkStream = require_chunkstream();
    var FilterAsync = require_filter_parse_async();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    var ParserAsync = module.exports = function(options) {
      ChunkStream.call(this);
      this._parser = new Parser(options, {
        read: this.read.bind(this),
        error: this._handleError.bind(this),
        metadata: this._handleMetaData.bind(this),
        gamma: this.emit.bind(this, "gamma"),
        palette: this._handlePalette.bind(this),
        transColor: this._handleTransColor.bind(this),
        finished: this._finished.bind(this),
        inflateData: this._inflateData.bind(this),
        simpleTransparency: this._simpleTransparency.bind(this),
        headersFinished: this._headersFinished.bind(this)
      });
      this._options = options;
      this.writable = true;
      this._parser.start();
    };
    util.inherits(ParserAsync, ChunkStream);
    ParserAsync.prototype._handleError = function(err) {
      this.emit("error", err);
      this.writable = false;
      this.destroy();
      if (this._inflate && this._inflate.destroy) {
        this._inflate.destroy();
      }
      if (this._filter) {
        this._filter.destroy();
        this._filter.on("error", function() {
        });
      }
      this.errord = true;
    };
    ParserAsync.prototype._inflateData = function(data) {
      if (!this._inflate) {
        if (this._bitmapInfo.interlace) {
          this._inflate = zlib.createInflate();
          this._inflate.on("error", this.emit.bind(this, "error"));
          this._filter.on("complete", this._complete.bind(this));
          this._inflate.pipe(this._filter);
        } else {
          let rowSize = (this._bitmapInfo.width * this._bitmapInfo.bpp * this._bitmapInfo.depth + 7 >> 3) + 1;
          let imageSize = rowSize * this._bitmapInfo.height;
          let chunkSize = Math.max(imageSize, zlib.Z_MIN_CHUNK);
          this._inflate = zlib.createInflate({ chunkSize });
          let leftToInflate = imageSize;
          let emitError = this.emit.bind(this, "error");
          this._inflate.on("error", function(err) {
            if (!leftToInflate) {
              return;
            }
            emitError(err);
          });
          this._filter.on("complete", this._complete.bind(this));
          let filterWrite = this._filter.write.bind(this._filter);
          this._inflate.on("data", function(chunk) {
            if (!leftToInflate) {
              return;
            }
            if (chunk.length > leftToInflate) {
              chunk = chunk.slice(0, leftToInflate);
            }
            leftToInflate -= chunk.length;
            filterWrite(chunk);
          });
          this._inflate.on("end", this._filter.end.bind(this._filter));
        }
      }
      this._inflate.write(data);
    };
    ParserAsync.prototype._handleMetaData = function(metaData) {
      this._metaData = metaData;
      this._bitmapInfo = Object.create(metaData);
      this._filter = new FilterAsync(this._bitmapInfo);
    };
    ParserAsync.prototype._handleTransColor = function(transColor) {
      this._bitmapInfo.transColor = transColor;
    };
    ParserAsync.prototype._handlePalette = function(palette) {
      this._bitmapInfo.palette = palette;
    };
    ParserAsync.prototype._simpleTransparency = function() {
      this._metaData.alpha = true;
    };
    ParserAsync.prototype._headersFinished = function() {
      this.emit("metadata", this._metaData);
    };
    ParserAsync.prototype._finished = function() {
      if (this.errord) {
        return;
      }
      if (!this._inflate) {
        this.emit("error", "No Inflate block");
      } else {
        this._inflate.end();
      }
    };
    ParserAsync.prototype._complete = function(filteredData) {
      if (this.errord) {
        return;
      }
      let normalisedBitmapData;
      try {
        let bitmapData = bitmapper.dataToBitMap(filteredData, this._bitmapInfo);
        normalisedBitmapData = formatNormaliser(
          bitmapData,
          this._bitmapInfo,
          this._options.skipRescale
        );
        bitmapData = null;
      } catch (ex) {
        this._handleError(ex);
        return;
      }
      this.emit("parsed", normalisedBitmapData);
    };
  }
});

// node_modules/pngjs/lib/bitpacker.js
var require_bitpacker = __commonJS({
  "node_modules/pngjs/lib/bitpacker.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    module.exports = function(dataIn, width, height, options) {
      let outHasAlpha = [constants.COLORTYPE_COLOR_ALPHA, constants.COLORTYPE_ALPHA].indexOf(
        options.colorType
      ) !== -1;
      if (options.colorType === options.inputColorType) {
        let bigEndian = function() {
          let buffer = new ArrayBuffer(2);
          new DataView(buffer).setInt16(
            0,
            256,
            true
            /* littleEndian */
          );
          return new Int16Array(buffer)[0] !== 256;
        }();
        if (options.bitDepth === 8 || options.bitDepth === 16 && bigEndian) {
          return dataIn;
        }
      }
      let data = options.bitDepth !== 16 ? dataIn : new Uint16Array(dataIn.buffer);
      let maxValue = 255;
      let inBpp = constants.COLORTYPE_TO_BPP_MAP[options.inputColorType];
      if (inBpp === 4 && !options.inputHasAlpha) {
        inBpp = 3;
      }
      let outBpp = constants.COLORTYPE_TO_BPP_MAP[options.colorType];
      if (options.bitDepth === 16) {
        maxValue = 65535;
        outBpp *= 2;
      }
      let outData = Buffer.alloc(width * height * outBpp);
      let inIndex = 0;
      let outIndex = 0;
      let bgColor = options.bgColor || {};
      if (bgColor.red === void 0) {
        bgColor.red = maxValue;
      }
      if (bgColor.green === void 0) {
        bgColor.green = maxValue;
      }
      if (bgColor.blue === void 0) {
        bgColor.blue = maxValue;
      }
      function getRGBA() {
        let red;
        let green;
        let blue;
        let alpha = maxValue;
        switch (options.inputColorType) {
          case constants.COLORTYPE_COLOR_ALPHA:
            alpha = data[inIndex + 3];
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_COLOR:
            red = data[inIndex];
            green = data[inIndex + 1];
            blue = data[inIndex + 2];
            break;
          case constants.COLORTYPE_ALPHA:
            alpha = data[inIndex + 1];
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          case constants.COLORTYPE_GRAYSCALE:
            red = data[inIndex];
            green = red;
            blue = red;
            break;
          default:
            throw new Error(
              "input color type:" + options.inputColorType + " is not supported at present"
            );
        }
        if (options.inputHasAlpha) {
          if (!outHasAlpha) {
            alpha /= maxValue;
            red = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.red + alpha * red), 0),
              maxValue
            );
            green = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.green + alpha * green), 0),
              maxValue
            );
            blue = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.blue + alpha * blue), 0),
              maxValue
            );
          }
        }
        return { red, green, blue, alpha };
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let rgba = getRGBA(data, inIndex);
          switch (options.colorType) {
            case constants.COLORTYPE_COLOR_ALPHA:
            case constants.COLORTYPE_COLOR:
              if (options.bitDepth === 8) {
                outData[outIndex] = rgba.red;
                outData[outIndex + 1] = rgba.green;
                outData[outIndex + 2] = rgba.blue;
                if (outHasAlpha) {
                  outData[outIndex + 3] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(rgba.red, outIndex);
                outData.writeUInt16BE(rgba.green, outIndex + 2);
                outData.writeUInt16BE(rgba.blue, outIndex + 4);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 6);
                }
              }
              break;
            case constants.COLORTYPE_ALPHA:
            case constants.COLORTYPE_GRAYSCALE: {
              let grayscale = (rgba.red + rgba.green + rgba.blue) / 3;
              if (options.bitDepth === 8) {
                outData[outIndex] = grayscale;
                if (outHasAlpha) {
                  outData[outIndex + 1] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(grayscale, outIndex);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 2);
                }
              }
              break;
            }
            default:
              throw new Error("unrecognised color Type " + options.colorType);
          }
          inIndex += inBpp;
          outIndex += outBpp;
        }
      }
      return outData;
    };
  }
});

// node_modules/pngjs/lib/filter-pack.js
var require_filter_pack = __commonJS({
  "node_modules/pngjs/lib/filter-pack.js"(exports, module) {
    "use strict";
    var paethPredictor = require_paeth_predictor();
    function filterNone(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        rawData[rawPos + x] = pxData[pxPos + x];
      }
    }
    function filterSumNone(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let i = pxPos; i < length; i++) {
        sum += Math.abs(pxData[i]);
      }
      return sum;
    }
    function filterSub(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumSub(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterUp(pxData, pxPos, byteWidth, rawData, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - up;
        rawData[rawPos + x] = val;
      }
    }
    function filterSumUp(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length = pxPos + byteWidth;
      for (let x = pxPos; x < length; x++) {
        let up = pxPos > 0 ? pxData[x - byteWidth] : 0;
        let val = pxData[x] - up;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterAvg(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumAvg(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterPaeth(pxData, pxPos, byteWidth, rawData, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        rawData[rawPos + x] = val;
      }
    }
    function filterSumPaeth(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        sum += Math.abs(val);
      }
      return sum;
    }
    var filters = {
      0: filterNone,
      1: filterSub,
      2: filterUp,
      3: filterAvg,
      4: filterPaeth
    };
    var filterSums = {
      0: filterSumNone,
      1: filterSumSub,
      2: filterSumUp,
      3: filterSumAvg,
      4: filterSumPaeth
    };
    module.exports = function(pxData, width, height, options, bpp) {
      let filterTypes;
      if (!("filterType" in options) || options.filterType === -1) {
        filterTypes = [0, 1, 2, 3, 4];
      } else if (typeof options.filterType === "number") {
        filterTypes = [options.filterType];
      } else {
        throw new Error("unrecognised filter types");
      }
      if (options.bitDepth === 16) {
        bpp *= 2;
      }
      let byteWidth = width * bpp;
      let rawPos = 0;
      let pxPos = 0;
      let rawData = Buffer.alloc((byteWidth + 1) * height);
      let sel = filterTypes[0];
      for (let y = 0; y < height; y++) {
        if (filterTypes.length > 1) {
          let min = Infinity;
          for (let i = 0; i < filterTypes.length; i++) {
            let sum = filterSums[filterTypes[i]](pxData, pxPos, byteWidth, bpp);
            if (sum < min) {
              sel = filterTypes[i];
              min = sum;
            }
          }
        }
        rawData[rawPos] = sel;
        rawPos++;
        filters[sel](pxData, pxPos, byteWidth, rawData, rawPos, bpp);
        rawPos += byteWidth;
        pxPos += byteWidth;
      }
      return rawData;
    };
  }
});

// node_modules/pngjs/lib/packer.js
var require_packer = __commonJS({
  "node_modules/pngjs/lib/packer.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var CrcStream = require_crc();
    var bitPacker = require_bitpacker();
    var filter = require_filter_pack();
    var zlib = __require("zlib");
    var Packer = module.exports = function(options) {
      this._options = options;
      options.deflateChunkSize = options.deflateChunkSize || 32 * 1024;
      options.deflateLevel = options.deflateLevel != null ? options.deflateLevel : 9;
      options.deflateStrategy = options.deflateStrategy != null ? options.deflateStrategy : 3;
      options.inputHasAlpha = options.inputHasAlpha != null ? options.inputHasAlpha : true;
      options.deflateFactory = options.deflateFactory || zlib.createDeflate;
      options.bitDepth = options.bitDepth || 8;
      options.colorType = typeof options.colorType === "number" ? options.colorType : constants.COLORTYPE_COLOR_ALPHA;
      options.inputColorType = typeof options.inputColorType === "number" ? options.inputColorType : constants.COLORTYPE_COLOR_ALPHA;
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.colorType) === -1) {
        throw new Error(
          "option color type:" + options.colorType + " is not supported at present"
        );
      }
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.inputColorType) === -1) {
        throw new Error(
          "option input color type:" + options.inputColorType + " is not supported at present"
        );
      }
      if (options.bitDepth !== 8 && options.bitDepth !== 16) {
        throw new Error(
          "option bit depth:" + options.bitDepth + " is not supported at present"
        );
      }
    };
    Packer.prototype.getDeflateOptions = function() {
      return {
        chunkSize: this._options.deflateChunkSize,
        level: this._options.deflateLevel,
        strategy: this._options.deflateStrategy
      };
    };
    Packer.prototype.createDeflate = function() {
      return this._options.deflateFactory(this.getDeflateOptions());
    };
    Packer.prototype.filterData = function(data, width, height) {
      let packedData = bitPacker(data, width, height, this._options);
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._options.colorType];
      let filteredData = filter(packedData, width, height, this._options, bpp);
      return filteredData;
    };
    Packer.prototype._packChunk = function(type, data) {
      let len = data ? data.length : 0;
      let buf = Buffer.alloc(len + 12);
      buf.writeUInt32BE(len, 0);
      buf.writeUInt32BE(type, 4);
      if (data) {
        data.copy(buf, 8);
      }
      buf.writeInt32BE(
        CrcStream.crc32(buf.slice(4, buf.length - 4)),
        buf.length - 4
      );
      return buf;
    };
    Packer.prototype.packGAMA = function(gamma) {
      let buf = Buffer.alloc(4);
      buf.writeUInt32BE(Math.floor(gamma * constants.GAMMA_DIVISION), 0);
      return this._packChunk(constants.TYPE_gAMA, buf);
    };
    Packer.prototype.packIHDR = function(width, height) {
      let buf = Buffer.alloc(13);
      buf.writeUInt32BE(width, 0);
      buf.writeUInt32BE(height, 4);
      buf[8] = this._options.bitDepth;
      buf[9] = this._options.colorType;
      buf[10] = 0;
      buf[11] = 0;
      buf[12] = 0;
      return this._packChunk(constants.TYPE_IHDR, buf);
    };
    Packer.prototype.packIDAT = function(data) {
      return this._packChunk(constants.TYPE_IDAT, data);
    };
    Packer.prototype.packIEND = function() {
      return this._packChunk(constants.TYPE_IEND, null);
    };
  }
});

// node_modules/pngjs/lib/packer-async.js
var require_packer_async = __commonJS({
  "node_modules/pngjs/lib/packer-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var constants = require_constants();
    var Packer = require_packer();
    var PackerAsync = module.exports = function(opt) {
      Stream.call(this);
      let options = opt || {};
      this._packer = new Packer(options);
      this._deflate = this._packer.createDeflate();
      this.readable = true;
    };
    util.inherits(PackerAsync, Stream);
    PackerAsync.prototype.pack = function(data, width, height, gamma) {
      this.emit("data", Buffer.from(constants.PNG_SIGNATURE));
      this.emit("data", this._packer.packIHDR(width, height));
      if (gamma) {
        this.emit("data", this._packer.packGAMA(gamma));
      }
      let filteredData = this._packer.filterData(data, width, height);
      this._deflate.on("error", this.emit.bind(this, "error"));
      this._deflate.on(
        "data",
        function(compressedData) {
          this.emit("data", this._packer.packIDAT(compressedData));
        }.bind(this)
      );
      this._deflate.on(
        "end",
        function() {
          this.emit("data", this._packer.packIEND());
          this.emit("end");
        }.bind(this)
      );
      this._deflate.end(filteredData);
    };
  }
});

// node_modules/pngjs/lib/sync-inflate.js
var require_sync_inflate = __commonJS({
  "node_modules/pngjs/lib/sync-inflate.js"(exports, module) {
    "use strict";
    var assert = __require("assert").ok;
    var zlib = __require("zlib");
    var util = __require("util");
    var kMaxLength = __require("buffer").kMaxLength;
    function Inflate(opts) {
      if (!(this instanceof Inflate)) {
        return new Inflate(opts);
      }
      if (opts && opts.chunkSize < zlib.Z_MIN_CHUNK) {
        opts.chunkSize = zlib.Z_MIN_CHUNK;
      }
      zlib.Inflate.call(this, opts);
      this._offset = this._offset === void 0 ? this._outOffset : this._offset;
      this._buffer = this._buffer || this._outBuffer;
      if (opts && opts.maxLength != null) {
        this._maxLength = opts.maxLength;
      }
    }
    function createInflate(opts) {
      return new Inflate(opts);
    }
    function _close(engine, callback) {
      if (callback) {
        process.nextTick(callback);
      }
      if (!engine._handle) {
        return;
      }
      engine._handle.close();
      engine._handle = null;
    }
    Inflate.prototype._processChunk = function(chunk, flushFlag, asyncCb) {
      if (typeof asyncCb === "function") {
        return zlib.Inflate._processChunk.call(this, chunk, flushFlag, asyncCb);
      }
      let self = this;
      let availInBefore = chunk && chunk.length;
      let availOutBefore = this._chunkSize - this._offset;
      let leftToInflate = this._maxLength;
      let inOff = 0;
      let buffers = [];
      let nread = 0;
      let error;
      this.on("error", function(err) {
        error = err;
      });
      function handleChunk(availInAfter, availOutAfter) {
        if (self._hadError) {
          return;
        }
        let have = availOutBefore - availOutAfter;
        assert(have >= 0, "have should not go down");
        if (have > 0) {
          let out = self._buffer.slice(self._offset, self._offset + have);
          self._offset += have;
          if (out.length > leftToInflate) {
            out = out.slice(0, leftToInflate);
          }
          buffers.push(out);
          nread += out.length;
          leftToInflate -= out.length;
          if (leftToInflate === 0) {
            return false;
          }
        }
        if (availOutAfter === 0 || self._offset >= self._chunkSize) {
          availOutBefore = self._chunkSize;
          self._offset = 0;
          self._buffer = Buffer.allocUnsafe(self._chunkSize);
        }
        if (availOutAfter === 0) {
          inOff += availInBefore - availInAfter;
          availInBefore = availInAfter;
          return true;
        }
        return false;
      }
      assert(this._handle, "zlib binding closed");
      let res;
      do {
        res = this._handle.writeSync(
          flushFlag,
          chunk,
          // in
          inOff,
          // in_off
          availInBefore,
          // in_len
          this._buffer,
          // out
          this._offset,
          //out_off
          availOutBefore
        );
        res = res || this._writeState;
      } while (!this._hadError && handleChunk(res[0], res[1]));
      if (this._hadError) {
        throw error;
      }
      if (nread >= kMaxLength) {
        _close(this);
        throw new RangeError(
          "Cannot create final Buffer. It would be larger than 0x" + kMaxLength.toString(16) + " bytes"
        );
      }
      let buf = Buffer.concat(buffers, nread);
      _close(this);
      return buf;
    };
    util.inherits(Inflate, zlib.Inflate);
    function zlibBufferSync(engine, buffer) {
      if (typeof buffer === "string") {
        buffer = Buffer.from(buffer);
      }
      if (!(buffer instanceof Buffer)) {
        throw new TypeError("Not a string or buffer");
      }
      let flushFlag = engine._finishFlushFlag;
      if (flushFlag == null) {
        flushFlag = zlib.Z_FINISH;
      }
      return engine._processChunk(buffer, flushFlag);
    }
    function inflateSync(buffer, opts) {
      return zlibBufferSync(new Inflate(opts), buffer);
    }
    module.exports = exports = inflateSync;
    exports.Inflate = Inflate;
    exports.createInflate = createInflate;
    exports.inflateSync = inflateSync;
  }
});

// node_modules/pngjs/lib/sync-reader.js
var require_sync_reader = __commonJS({
  "node_modules/pngjs/lib/sync-reader.js"(exports, module) {
    "use strict";
    var SyncReader = module.exports = function(buffer) {
      this._buffer = buffer;
      this._reads = [];
    };
    SyncReader.prototype.read = function(length, callback) {
      this._reads.push({
        length: Math.abs(length),
        // if length < 0 then at most this length
        allowLess: length < 0,
        func: callback
      });
    };
    SyncReader.prototype.process = function() {
      while (this._reads.length > 0 && this._buffer.length) {
        let read = this._reads[0];
        if (this._buffer.length && (this._buffer.length >= read.length || read.allowLess)) {
          this._reads.shift();
          let buf = this._buffer;
          this._buffer = buf.slice(read.length);
          read.func.call(this, buf.slice(0, read.length));
        } else {
          break;
        }
      }
      if (this._reads.length > 0) {
        throw new Error("There are some read requests waitng on finished stream");
      }
      if (this._buffer.length > 0) {
        throw new Error("unrecognised content at end of stream");
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-sync.js
var require_filter_parse_sync = __commonJS({
  "node_modules/pngjs/lib/filter-parse-sync.js"(exports) {
    "use strict";
    var SyncReader = require_sync_reader();
    var Filter = require_filter_parse();
    exports.process = function(inBuffer, bitmapInfo) {
      let outBuffers = [];
      let reader = new SyncReader(inBuffer);
      let filter = new Filter(bitmapInfo, {
        read: reader.read.bind(reader),
        write: function(bufferPart) {
          outBuffers.push(bufferPart);
        },
        complete: function() {
        }
      });
      filter.start();
      reader.process();
      return Buffer.concat(outBuffers);
    };
  }
});

// node_modules/pngjs/lib/parser-sync.js
var require_parser_sync = __commonJS({
  "node_modules/pngjs/lib/parser-sync.js"(exports, module) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = __require("zlib");
    var inflateSync = require_sync_inflate();
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var SyncReader = require_sync_reader();
    var FilterSync = require_filter_parse_sync();
    var Parser = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    module.exports = function(buffer, options) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let err;
      function handleError(_err_) {
        err = _err_;
      }
      let metaData;
      function handleMetaData(_metaData_) {
        metaData = _metaData_;
      }
      function handleTransColor(transColor) {
        metaData.transColor = transColor;
      }
      function handlePalette(palette) {
        metaData.palette = palette;
      }
      function handleSimpleTransparency() {
        metaData.alpha = true;
      }
      let gamma;
      function handleGamma(_gamma_) {
        gamma = _gamma_;
      }
      let inflateDataList = [];
      function handleInflateData(inflatedData2) {
        inflateDataList.push(inflatedData2);
      }
      let reader = new SyncReader(buffer);
      let parser = new Parser(options, {
        read: reader.read.bind(reader),
        error: handleError,
        metadata: handleMetaData,
        gamma: handleGamma,
        palette: handlePalette,
        transColor: handleTransColor,
        inflateData: handleInflateData,
        simpleTransparency: handleSimpleTransparency
      });
      parser.start();
      reader.process();
      if (err) {
        throw err;
      }
      let inflateData = Buffer.concat(inflateDataList);
      inflateDataList.length = 0;
      let inflatedData;
      if (metaData.interlace) {
        inflatedData = zlib.inflateSync(inflateData);
      } else {
        let rowSize = (metaData.width * metaData.bpp * metaData.depth + 7 >> 3) + 1;
        let imageSize = rowSize * metaData.height;
        inflatedData = inflateSync(inflateData, {
          chunkSize: imageSize,
          maxLength: imageSize
        });
      }
      inflateData = null;
      if (!inflatedData || !inflatedData.length) {
        throw new Error("bad png - invalid inflate data response");
      }
      let unfilteredData = FilterSync.process(inflatedData, metaData);
      inflateData = null;
      let bitmapData = bitmapper.dataToBitMap(unfilteredData, metaData);
      unfilteredData = null;
      let normalisedBitmapData = formatNormaliser(
        bitmapData,
        metaData,
        options.skipRescale
      );
      metaData.data = normalisedBitmapData;
      metaData.gamma = gamma || 0;
      return metaData;
    };
  }
});

// node_modules/pngjs/lib/packer-sync.js
var require_packer_sync = __commonJS({
  "node_modules/pngjs/lib/packer-sync.js"(exports, module) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = __require("zlib");
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var constants = require_constants();
    var Packer = require_packer();
    module.exports = function(metaData, opt) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let options = opt || {};
      let packer = new Packer(options);
      let chunks = [];
      chunks.push(Buffer.from(constants.PNG_SIGNATURE));
      chunks.push(packer.packIHDR(metaData.width, metaData.height));
      if (metaData.gamma) {
        chunks.push(packer.packGAMA(metaData.gamma));
      }
      let filteredData = packer.filterData(
        metaData.data,
        metaData.width,
        metaData.height
      );
      let compressedData = zlib.deflateSync(
        filteredData,
        packer.getDeflateOptions()
      );
      filteredData = null;
      if (!compressedData || !compressedData.length) {
        throw new Error("bad png - invalid compressed data response");
      }
      chunks.push(packer.packIDAT(compressedData));
      chunks.push(packer.packIEND());
      return Buffer.concat(chunks);
    };
  }
});

// node_modules/pngjs/lib/png-sync.js
var require_png_sync = __commonJS({
  "node_modules/pngjs/lib/png-sync.js"(exports) {
    "use strict";
    var parse = require_parser_sync();
    var pack = require_packer_sync();
    exports.read = function(buffer, options) {
      return parse(buffer, options || {});
    };
    exports.write = function(png, options) {
      return pack(png, options);
    };
  }
});

// node_modules/pngjs/lib/png.js
var require_png = __commonJS({
  "node_modules/pngjs/lib/png.js"(exports) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var Parser = require_parser_async();
    var Packer = require_packer_async();
    var PNGSync = require_png_sync();
    var PNG2 = exports.PNG = function(options) {
      Stream.call(this);
      options = options || {};
      this.width = options.width | 0;
      this.height = options.height | 0;
      this.data = this.width > 0 && this.height > 0 ? Buffer.alloc(4 * this.width * this.height) : null;
      if (options.fill && this.data) {
        this.data.fill(0);
      }
      this.gamma = 0;
      this.readable = this.writable = true;
      this._parser = new Parser(options);
      this._parser.on("error", this.emit.bind(this, "error"));
      this._parser.on("close", this._handleClose.bind(this));
      this._parser.on("metadata", this._metadata.bind(this));
      this._parser.on("gamma", this._gamma.bind(this));
      this._parser.on(
        "parsed",
        function(data) {
          this.data = data;
          this.emit("parsed", data);
        }.bind(this)
      );
      this._packer = new Packer(options);
      this._packer.on("data", this.emit.bind(this, "data"));
      this._packer.on("end", this.emit.bind(this, "end"));
      this._parser.on("close", this._handleClose.bind(this));
      this._packer.on("error", this.emit.bind(this, "error"));
    };
    util.inherits(PNG2, Stream);
    PNG2.sync = PNGSync;
    PNG2.prototype.pack = function() {
      if (!this.data || !this.data.length) {
        this.emit("error", "No data provided");
        return this;
      }
      process.nextTick(
        function() {
          this._packer.pack(this.data, this.width, this.height, this.gamma);
        }.bind(this)
      );
      return this;
    };
    PNG2.prototype.parse = function(data, callback) {
      if (callback) {
        let onParsed, onError;
        onParsed = function(parsedData) {
          this.removeListener("error", onError);
          this.data = parsedData;
          callback(null, this);
        }.bind(this);
        onError = function(err) {
          this.removeListener("parsed", onParsed);
          callback(err, null);
        }.bind(this);
        this.once("parsed", onParsed);
        this.once("error", onError);
      }
      this.end(data);
      return this;
    };
    PNG2.prototype.write = function(data) {
      this._parser.write(data);
      return true;
    };
    PNG2.prototype.end = function(data) {
      this._parser.end(data);
    };
    PNG2.prototype._metadata = function(metadata) {
      this.width = metadata.width;
      this.height = metadata.height;
      this.emit("metadata", metadata);
    };
    PNG2.prototype._gamma = function(gamma) {
      this.gamma = gamma;
    };
    PNG2.prototype._handleClose = function() {
      if (!this._parser.writable && !this._packer.readable) {
        this.emit("close");
      }
    };
    PNG2.bitblt = function(src, dst, srcX, srcY, width, height, deltaX, deltaY) {
      srcX |= 0;
      srcY |= 0;
      width |= 0;
      height |= 0;
      deltaX |= 0;
      deltaY |= 0;
      if (srcX > src.width || srcY > src.height || srcX + width > src.width || srcY + height > src.height) {
        throw new Error("bitblt reading outside image");
      }
      if (deltaX > dst.width || deltaY > dst.height || deltaX + width > dst.width || deltaY + height > dst.height) {
        throw new Error("bitblt writing outside image");
      }
      for (let y = 0; y < height; y++) {
        src.data.copy(
          dst.data,
          (deltaY + y) * dst.width + deltaX << 2,
          (srcY + y) * src.width + srcX << 2,
          (srcY + y) * src.width + srcX + width << 2
        );
      }
    };
    PNG2.prototype.bitblt = function(dst, srcX, srcY, width, height, deltaX, deltaY) {
      PNG2.bitblt(this, dst, srcX, srcY, width, height, deltaX, deltaY);
      return this;
    };
    PNG2.adjustGamma = function(src) {
      if (src.gamma) {
        for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            let idx = src.width * y + x << 2;
            for (let i = 0; i < 3; i++) {
              let sample = src.data[idx + i] / 255;
              sample = Math.pow(sample, 1 / 2.2 / src.gamma);
              src.data[idx + i] = Math.round(sample * 255);
            }
          }
        }
        src.gamma = 0;
      }
    };
    PNG2.prototype.adjustGamma = function() {
      PNG2.adjustGamma(this);
    };
  }
});

// apps/camera-vision/backend/index.ts
var import_jpeg_js = __toESM(require_jpeg_js(), 1);
var import_pngjs = __toESM(require_png(), 1);
import fs3 from "node:fs";
import net2 from "node:net";

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// packages/sdk/src/actions.ts
import fs2 from "node:fs";
import path2 from "node:path";
import net from "node:net";
import dgram from "node:dgram";
var PcAgentReverseBridgeImpl = class {
  latestStatus = null;
  lastSeenAt = 0;
  latestFrameJpeg = null;
  requestedMonitor = "primary";
  queue = [];
  resolvers = /* @__PURE__ */ new Map();
  ingestSync(body) {
    this.lastSeenAt = Date.now();
    if (body.status && typeof body.status === "object") {
      this.latestStatus = body.status;
    }
    if (body.frameBase64 && typeof body.frameBase64 === "string") {
      this.latestFrameJpeg = Buffer.from(body.frameBase64, "base64");
    }
    const commands = this.queue.splice(0, this.queue.length);
    return {
      requestedMonitor: this.requestedMonitor,
      commands
    };
  }
  resolveCommand(id, result, error) {
    const pending = this.resolvers.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.resolvers.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }
  async getStatusOrCall(baseUrl) {
    if (this.latestStatus && Date.now() - this.lastSeenAt < 15e3) {
      return this.latestStatus;
    }
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(1200)
      });
      if (res.ok) {
        const snap = await res.json();
        this.latestStatus = snap;
        this.lastSeenAt = Date.now();
        return snap;
      }
    } catch {
    }
    if (this.latestStatus) {
      return this.latestStatus;
    }
    throw new Error("Thassi.PcAgent on DESKTOP-M8TJERB is currently offline or unreachable.");
  }
  async callEndpoint(baseUrl, endpoint, payload, timeoutMs = 8e3) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(700)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
    }
    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(id);
        reject(new Error(`Timeout waiting for Thassi.PcAgent (${endpoint}) after ${timeoutMs}ms`));
      }, timeoutMs);
      this.resolvers.set(id, { resolve, reject, timer });
      this.queue.push({ id, endpoint, payload, createdAt: Date.now() });
    });
  }
};
var PcAgentReverseBridge = new PcAgentReverseBridgeImpl();

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/camera-vision/backend/index.ts
var OPTIMIZATION_MODES = [
  "Personen",
  "Fahrzeuge",
  "Objekte",
  "Kamera",
  "Aktivit\xE4ten"
];
var DEFAULT_CAMERAS = [
  {
    id: "camera.garten_parkplatz_kamera",
    name: "Kamera Drau\xDFen Hinten Werkstatt",
    room: "Werkstatt / Au\xDFen",
    source_type: "ha_entity",
    stream_url: "",
    lan_ip: "192.168.188.121",
    enabled: 1,
    sample_interval_sec: 180,
    optimization_mode: "Fahrzeuge",
    target_classes: JSON.stringify(["car", "truck", "bicycle", "motorcycle", "person"]),
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.8,
    pixel_diff_threshold: 26,
    ai_input_width: 640,
    log_cooldown_sec: 30,
    high_freq_poll_sec: 3
  },
  {
    id: "camera.cam_eg_vz_eingang",
    name: "EG Vorzimmer Kamera",
    room: "Vorzimmer EG / Eingang",
    source_type: "ha_entity",
    stream_url: "",
    lan_ip: "192.168.188.140",
    enabled: 1,
    sample_interval_sec: 180,
    optimization_mode: "Personen",
    target_classes: JSON.stringify(["person", "backpack", "handbag", "suitcase"]),
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.2,
    pixel_diff_threshold: 24,
    ai_input_width: 640,
    log_cooldown_sec: 25,
    high_freq_poll_sec: 2
  },
  {
    id: "camera.lsc_smart_ptz_camera_2",
    name: "LSC Smart PTZ Camera 2",
    room: "Innen / Allgemein",
    source_type: "ha_entity",
    stream_url: "",
    lan_ip: "",
    enabled: 1,
    sample_interval_sec: 300,
    optimization_mode: "Aktivit\xE4ten",
    target_classes: JSON.stringify(["person", "dog", "cat"]),
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.4,
    pixel_diff_threshold: 25,
    ai_input_width: 640,
    log_cooldown_sec: 30,
    high_freq_poll_sec: 4
  },
  {
    id: "camera.lsc_smart_ptz_camera_3",
    name: "LSC Smart PTZ Camera 3",
    room: "B\xFCro OG",
    source_type: "ha_entity",
    stream_url: "",
    lan_ip: "",
    enabled: 1,
    sample_interval_sec: 300,
    optimization_mode: "Objekte",
    target_classes: JSON.stringify(["person", "laptop", "chair", "cell phone", "cup"]),
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.2,
    pixel_diff_threshold: 24,
    ai_input_width: 640,
    log_cooldown_sec: 45,
    high_freq_poll_sec: 4
  },
  {
    id: "camera.lsc_smart_outdoor_camera",
    name: "LSC Smart Outdoor Camera",
    room: "Garten / Au\xDFen",
    source_type: "ha_entity",
    stream_url: "",
    lan_ip: "",
    enabled: 1,
    sample_interval_sec: 300,
    optimization_mode: "Aktivit\xE4ten",
    target_classes: JSON.stringify(["person", "car", "dog", "cat", "bird"]),
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.8,
    pixel_diff_threshold: 26,
    ai_input_width: 640,
    log_cooldown_sec: 30,
    high_freq_poll_sec: 4
  },
  {
    id: "camera.lsc_smart_indoor_camera",
    name: "LSC Smart Indoor Camera",
    room: "Innen / Diagnose",
    source_type: "ha_entity",
    stream_url: "",
    lan_ip: "",
    enabled: 1,
    sample_interval_sec: 300,
    optimization_mode: "Kamera",
    target_classes: JSON.stringify(["person"]),
    min_confidence: 0.45,
    motion_gate_enabled: 1,
    motion_threshold_pct: 2.2,
    pixel_diff_threshold: 24,
    ai_input_width: 640,
    log_cooldown_sec: 60,
    high_freq_poll_sec: 5
  }
];
var VEHICLE_CLASSES = /* @__PURE__ */ new Set(["car", "truck", "bus", "motorcycle", "bicycle", "train", "boat"]);
var ANIMAL_CLASSES = /* @__PURE__ */ new Set(["dog", "cat", "bird", "horse", "sheep", "cow", "bear", "zebra", "giraffe"]);
var GERMAN_LABELS = {
  person: "Person",
  car: "Auto",
  truck: "LKW / Transporter",
  bus: "Bus",
  motorcycle: "Motorrad",
  bicycle: "Fahrrad",
  dog: "Hund",
  cat: "Katze",
  bird: "Vogel",
  backpack: "Rucksack / Paket",
  handbag: "Tasche",
  suitcase: "Koffer / Paket",
  umbrella: "Regenschirm",
  bottle: "Flasche",
  cup: "Tasse",
  chair: "Stuhl",
  couch: "Sofa",
  potted_plant: "Pflanze",
  "potted plant": "Pflanze",
  tv: "Monitor / TV",
  laptop: "Laptop",
  mouse: "Maus",
  keyboard: "Tastatur",
  "cell phone": "Smartphone",
  book: "Buch",
  clock: "Uhr",
  any_vehicle: "Beliebiges Fahrzeug (Auto/LKW/Rad)",
  any_animal: "Beliebiges Tier (Hund/Katze/Vogel)",
  any_object: "Beliebiges Objekt",
  motion_only: "Reine Pixel-Bewegung (ohne KI-Klasse)"
};
var JPEG_SOI = Buffer.from([255, 216, 255]);
var JPEG_EOI = Buffer.from([255, 217]);
var previousLumaGrids = /* @__PURE__ */ new Map();
var VisionPerformanceTracker = class {
  startedAtMs = Date.now();
  startedAtIso = (/* @__PURE__ */ new Date()).toISOString();
  totalFramesIngested = 0;
  totalFramesDecoded = 0;
  totalLumaChecks = 0;
  totalCocoRuns = 0;
  totalMotionGateSkips = 0;
  totalTriggersFired = 0;
  captureSamples = [];
  decodeSamples = [];
  lumaSamples = [];
  inferenceSamples = [];
  camStats = /* @__PURE__ */ new Map();
  getOrCreateCam(cameraId) {
    let st = this.camStats.get(cameraId);
    if (!st) {
      st = {
        cameraId,
        framesIngested: 0,
        framesDecoded: 0,
        lumaChecks: 0,
        cocoRuns: 0,
        motionSkips: 0,
        lastCaptureMs: 0,
        lastDecodeMs: 0,
        lastLumaMs: 0,
        lastInferenceMs: 0,
        lastMotionPct: 0,
        lastUpdatedIso: (/* @__PURE__ */ new Date()).toISOString(),
        triggersFired: 0,
        recentFrameTs: []
      };
      this.camStats.set(cameraId, st);
    }
    return st;
  }
  pushSample(arr, val, maxLen = 80) {
    arr.push(val);
    if (arr.length > maxLen) arr.shift();
  }
  avg(arr) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;
  }
  recordRawIngest(cameraId, captureMs) {
    this.totalFramesIngested++;
    const st = this.getOrCreateCam(cameraId);
    st.framesIngested++;
    st.lastCaptureMs = captureMs;
    const now = Date.now();
    st.recentFrameTs = st.recentFrameTs.filter((t) => now - t < 1e4);
    st.recentFrameTs.push(now);
    st.lastUpdatedIso = new Date(now).toISOString();
    this.pushSample(this.captureSamples, captureMs);
  }
  recordLumaCheck(cameraId, decodeMs, lumaMs, motionPct) {
    this.totalFramesDecoded++;
    this.totalLumaChecks++;
    this.pushSample(this.decodeSamples, decodeMs);
    this.pushSample(this.lumaSamples, lumaMs);
    const st = this.getOrCreateCam(cameraId);
    st.framesDecoded++;
    st.lumaChecks++;
    st.lastDecodeMs = decodeMs;
    st.lastLumaMs = lumaMs;
    st.lastMotionPct = motionPct;
    st.lastUpdatedIso = (/* @__PURE__ */ new Date()).toISOString();
  }
  recordMotionGateSkip(cameraId) {
    this.totalMotionGateSkips++;
    const st = this.getOrCreateCam(cameraId);
    st.motionSkips++;
  }
  recordCocoRun(cameraId, inferenceMs) {
    this.totalCocoRuns++;
    this.pushSample(this.inferenceSamples, inferenceMs);
    const st = this.getOrCreateCam(cameraId);
    st.cocoRuns++;
    st.lastInferenceMs = inferenceMs;
    st.lastUpdatedIso = (/* @__PURE__ */ new Date()).toISOString();
  }
  recordTriggerFired(cameraId) {
    this.totalTriggersFired++;
    const st = this.getOrCreateCam(cameraId);
    st.triggersFired++;
  }
  getSnapshot(activeWorkers) {
    const mem = process.memoryUsage();
    const tfTensors = 0;
    const tfBytesMb = 0;
    const tfBackend = "luma-motion-gate";
    const avgInf = this.avg(this.inferenceSamples) || 180;
    const skipRatePct = this.totalLumaChecks > 0 ? Math.round(this.totalMotionGateSkips / this.totalLumaChecks * 1e3) / 10 : 0;
    const savedCpuSeconds = Math.round(this.totalMotionGateSkips * avgInf / 1e3 * 10) / 10;
    const now = Date.now();
    const cameraBreakdown = Array.from(this.camStats.values()).map((c) => {
      const recent = c.recentFrameTs.filter((t) => now - t < 1e4);
      const fps = recent.length >= 2 ? Math.round(
        (recent.length - 1) / Math.max(0.5, (recent[recent.length - 1] - recent[0]) / 1e3) * 10
      ) / 10 : 0;
      const camSkipPct = c.lumaChecks > 0 ? Math.round(c.motionSkips / c.lumaChecks * 1e3) / 10 : 0;
      return {
        cameraId: c.cameraId,
        framesIngested: c.framesIngested,
        framesDecoded: c.framesDecoded,
        lumaChecks: c.lumaChecks,
        cocoRuns: c.cocoRuns,
        motionSkips: c.motionSkips,
        skipRatePct: camSkipPct,
        lastCaptureMs: c.lastCaptureMs,
        lastDecodeMs: c.lastDecodeMs,
        lastLumaMs: c.lastLumaMs,
        lastInferenceMs: c.lastInferenceMs,
        lastMotionPct: c.lastMotionPct,
        streamFps: fps,
        streamWorkerActive: activeWorkers.has(c.cameraId),
        triggersFired: c.triggersFired,
        lastUpdatedIso: c.lastUpdatedIso
      };
    });
    return {
      startedAtIso: this.startedAtIso,
      uptimeSec: Math.round((now - this.startedAtMs) / 1e3),
      activeStreamWorkers: activeWorkers.size,
      totalFramesIngested: this.totalFramesIngested,
      totalFramesDecoded: this.totalFramesDecoded,
      totalLumaChecks: this.totalLumaChecks,
      totalCocoRuns: this.totalCocoRuns,
      totalMotionGateSkips: this.totalMotionGateSkips,
      motionGateSkipRatePct: skipRatePct,
      savedCpuSeconds,
      totalTriggersFired: this.totalTriggersFired,
      avgCaptureMs: this.avg(this.captureSamples),
      avgDecodeMs: this.avg(this.decodeSamples),
      avgLumaMs: this.avg(this.lumaSamples),
      avgInferenceMs: this.avg(this.inferenceSamples),
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024) * 10) / 10,
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024) * 10) / 10,
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024) * 10) / 10,
        tfTensors,
        tfBytesMb,
        tfBackend
      },
      cameraBreakdown
    };
  }
};
var perfTracker = new VisionPerformanceTracker();
async function detectViaWorkerOrFallback(_rgb, _width, _height, _maxNumBoxes, _minScore) {
  return [];
}
var CLUTTER_BACKGROUND_CLASSES = /* @__PURE__ */ new Set([
  "potted plant",
  "potted_plant",
  "chair",
  "couch",
  "bed",
  "dining table",
  "dining_table",
  "toilet",
  "sink",
  "refrigerator",
  "oven",
  "vase",
  "clock",
  "book",
  "toothbrush",
  "hair drier",
  "bowl",
  "tv"
]);
var staticPhantomTracker = /* @__PURE__ */ new Map();
function computeBoxIoU(a, b) {
  const xA = Math.max(a.x, b.x);
  const yA = Math.max(a.y, b.y);
  const xB = Math.min(a.x + a.w, b.x + b.w);
  const yB = Math.min(a.y + a.h, b.y + b.h);
  const interW = Math.max(0, xB - xA);
  const interH = Math.max(0, yB - yA);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;
  const unionArea = a.w * a.h + b.w * b.h - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}
function resampleRgbaRegionToRgbBuffer(rgba, srcWidth, srcHeight, cropX0, cropY0, cropW, cropH, dstW, dstH) {
  const rgb = new Int32Array(dstW * dstH * 3);
  const scaleX = cropW / dstW;
  const scaleY = cropH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy0 = Math.min(srcHeight - 1, Math.max(0, Math.floor(cropY0 + (y + 0.25) * scaleY)));
    const sy1 = Math.min(srcHeight - 1, Math.max(0, Math.floor(cropY0 + (y + 0.75) * scaleY)));
    const row0 = sy0 * srcWidth;
    const row1 = sy1 * srcWidth;
    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.min(srcWidth - 1, Math.max(0, Math.floor(cropX0 + (x + 0.25) * scaleX)));
      const sx1 = Math.min(srcWidth - 1, Math.max(0, Math.floor(cropX0 + (x + 0.75) * scaleX)));
      const i00 = (row0 + sx0) * 4;
      const i01 = (row0 + sx1) * 4;
      const i10 = (row1 + sx0) * 4;
      const i11 = (row1 + sx1) * 4;
      const dstIdx = (y * dstW + x) * 3;
      rgb[dstIdx] = rgba[i00] + rgba[i01] + rgba[i10] + rgba[i11] >> 2;
      rgb[dstIdx + 1] = rgba[i00 + 1] + rgba[i01 + 1] + rgba[i10 + 1] + rgba[i11 + 1] >> 2;
      rgb[dstIdx + 2] = rgba[i00 + 2] + rgba[i01 + 2] + rgba[i10 + 2] + rgba[i11 + 2] >> 2;
    }
  }
  return rgb;
}
function checkTcpPort(ip, port, timeoutMs = 350) {
  return new Promise((resolve) => {
    if (!ip) return resolve(false);
    const sock = new net2.Socket();
    sock.setTimeout(timeoutMs);
    sock.on("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, ip);
  });
}
function decodeImageBuffer(buf, mimeType) {
  const t0 = performance.now();
  const isPng = mimeType.includes("png") || buf.length > 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71;
  if (isPng) {
    const parsed = import_pngjs.PNG.sync.read(buf);
    return {
      width: parsed.width,
      height: parsed.height,
      rgba: new Uint8Array(parsed.data),
      decodeMs: Math.round((performance.now() - t0) * 10) / 10
    };
  }
  const decoded = import_jpeg_js.default.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 });
  return {
    width: decoded.width,
    height: decoded.height,
    rgba: decoded.data,
    decodeMs: Math.round((performance.now() - t0) * 10) / 10
  };
}
function analyzePixelMetricsAndMotion(cameraId, width, height, rgba, gridMap = previousLumaGrids, pixelDiffThreshold = 25, decodeMs = 0) {
  const t0 = performance.now();
  const gridW = 48;
  const gridH = 27;
  const currentGrid = new Float32Array(gridW * gridH);
  let sumLuma = 0;
  let sumLumaSq = 0;
  const cellSpanW = width / gridW;
  const cellSpanH = height / gridH;
  const subOffsets = [0.15, 0.38, 0.62, 0.85];
  for (let gy = 0; gy < gridH; gy++) {
    const baseY = gy * cellSpanH;
    for (let gx = 0; gx < gridW; gx++) {
      const baseX = gx * cellSpanW;
      let blockSum = 0;
      for (let syi = 0; syi < 4; syi++) {
        const py = Math.min(height - 1, Math.floor(baseY + subOffsets[syi] * cellSpanH));
        const rowOffset = py * width;
        for (let sxi = 0; sxi < 4; sxi++) {
          const px = Math.min(width - 1, Math.floor(baseX + subOffsets[sxi] * cellSpanW));
          const idx = (rowOffset + px) * 4;
          blockSum += 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
        }
      }
      const luma = blockSum / 16;
      currentGrid[gy * gridW + gx] = luma;
      sumLuma += luma;
      sumLumaSq += luma * luma;
    }
  }
  const n = gridW * gridH;
  const meanLuma = sumLuma / n;
  const variance = Math.max(0, sumLumaSq / n - meanLuma * meanLuma);
  const stdDev = Math.sqrt(variance);
  let edgeSum = 0;
  let edgeCount = 0;
  for (let gy = 1; gy < gridH - 1; gy++) {
    for (let gx = 1; gx < gridW - 1; gx++) {
      const c = currentGrid[gy * gridW + gx];
      const dx = Math.abs(c - currentGrid[gy * gridW + (gx + 1)]);
      const dy = Math.abs(c - currentGrid[(gy + 1) * gridW + gx]);
      edgeSum += dx + dy;
      edgeCount++;
    }
  }
  const sharpnessScore = Math.min(100, Math.round(edgeSum / Math.max(1, edgeCount) * 2.8));
  const luminancePct = Math.round(meanLuma / 255 * 100);
  const contrastScore = Math.min(100, Math.round(stdDev / 75 * 100));
  const occlusionAlert = contrastScore < 8 || sharpnessScore < 6;
  const lightingMode = luminancePct < 18 ? "Nachtsicht / Dunkel" : luminancePct < 45 ? "D\xE4mmerung / Innen" : "Taglicht";
  const prevGrid = gridMap.get(cameraId);
  let motionPct = 0;
  let activeMotionZone = "Keine Bewegung";
  const motionBoxes = [];
  const effectiveDiffThreshold = Math.max(18, Math.min(80, Number(pixelDiffThreshold) || 25));
  if (prevGrid && prevGrid.length === currentGrid.length) {
    let prevSum = 0;
    for (let i = 0; i < n; i++) prevSum += prevGrid[i];
    const prevMeanLuma = prevSum / n;
    const globalShift = Math.max(-35, Math.min(35, meanLuma - prevMeanLuma));
    const diffGrid = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      diffGrid[i] = Math.abs(currentGrid[i] - prevGrid[i] - globalShift);
    }
    let changedCells = 0;
    let weightedX = 0;
    let weightedY = 0;
    const macroCols = 6;
    const macroRows = 3;
    const cellW = gridW / macroCols;
    const cellH = gridH / macroRows;
    const clusters = Array.from({ length: macroCols * macroRows }, () => ({
      minX: gridW,
      minY: gridH,
      maxX: 0,
      maxY: 0,
      count: 0,
      maxDiff: 0
    }));
    const neighborFloor = effectiveDiffThreshold * 0.72;
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const diff = diffGrid[gy * gridW + gx];
        if (diff <= effectiveDiffThreshold) continue;
        let activeNeighbors = 0;
        const nyMin = Math.max(0, gy - 1);
        const nyMax = Math.min(gridH - 1, gy + 1);
        const nxMin = Math.max(0, gx - 1);
        const nxMax = Math.min(gridW - 1, gx + 1);
        for (let ny = nyMin; ny <= nyMax; ny++) {
          for (let nx = nxMin; nx <= nxMax; nx++) {
            if (nx === gx && ny === gy) continue;
            if (diffGrid[ny * gridW + nx] > neighborFloor) {
              activeNeighbors++;
            }
          }
        }
        if (activeNeighbors >= 2 || diff > effectiveDiffThreshold * 1.85) {
          changedCells++;
          weightedX += gx / gridW;
          weightedY += gy / gridH;
          const mc = Math.min(macroCols - 1, Math.floor(gx / cellW));
          const mr = Math.min(macroRows - 1, Math.floor(gy / cellH));
          const cl = clusters[mr * macroCols + mc];
          cl.count++;
          if (gx < cl.minX) cl.minX = gx;
          if (gy < cl.minY) cl.minY = gy;
          if (gx + 1 > cl.maxX) cl.maxX = gx + 1;
          if (gy + 1 > cl.maxY) cl.maxY = gy + 1;
          if (diff > cl.maxDiff) cl.maxDiff = diff;
        }
      }
    }
    motionPct = Math.round(changedCells / n * 1e3) / 10;
    if (changedCells > 0) {
      const avgX = weightedX / changedCells;
      const avgY = weightedY / changedCells;
      const hZone = avgX < 0.35 ? "Links" : avgX > 0.65 ? "Rechts" : "Mitte";
      const vZone = avgY < 0.35 ? "Oben" : avgY > 0.65 ? "Unten" : "Zentrum";
      activeMotionZone = `${vZone}-${hZone}`;
      clusters.filter((c) => c.count >= 6).sort((a, b) => b.count - a.count).slice(0, 3).forEach((c) => {
        const padX = 1.5;
        const padY = 1.5;
        const x0 = Math.max(0, (c.minX - padX) / gridW);
        const y0 = Math.max(0, (c.minY - padY) / gridH);
        const x1 = Math.min(1, (c.maxX + padX) / gridW);
        const y1 = Math.min(1, (c.maxY + padY) / gridH);
        motionBoxes.push({
          x: Math.round(x0 * 1e3) / 1e3,
          y: Math.round(y0 * 1e3) / 1e3,
          w: Math.round(Math.max(0.08, x1 - x0) * 1e3) / 1e3,
          h: Math.round(Math.max(0.12, y1 - y0) * 1e3) / 1e3,
          label: "Bewegung",
          rawClass: "motion",
          confidence: Math.min(0.99, Math.round(c.maxDiff / 95 * 100) / 100),
          category: "motion"
        });
      });
    }
  }
  gridMap.set(cameraId, currentGrid);
  const lumaMs = Math.round((performance.now() - t0) * 100) / 100;
  perfTracker.recordLumaCheck(cameraId, decodeMs, lumaMs, motionPct);
  return {
    luminancePct,
    contrastScore,
    sharpnessScore,
    lightingMode,
    occlusionAlert,
    motionPct,
    activeMotionZone,
    motionBoxes,
    lumaMs,
    decodeMs
  };
}
async function runLocalCocoSsdPipeline(cameraId, imageBuffer, mimeType, mode, opts = {}) {
  const decoded = opts.preDecoded || decodeImageBuffer(imageBuffer, mimeType);
  const { width, height, rgba, decodeMs } = decoded;
  const pixelDiffThreshold = opts.pixelDiffThreshold ?? 25;
  const metrics = analyzePixelMetricsAndMotion(
    cameraId,
    width,
    height,
    rgba,
    previousLumaGrids,
    pixelDiffThreshold,
    decodeMs
  );
  const motionGateEnabled = opts.motionGateEnabled ?? true;
  const motionThresholdPct = Math.max(0.8, opts.motionThresholdPct ?? 2.2);
  const nowMs = Date.now();
  const hasMotion = metrics.motionPct >= motionThresholdPct;
  const withinTrackingTail = opts.lastPositiveObjectAtMs !== void 0 && nowMs - opts.lastPositiveObjectAtMs < 1e4;
  const heartbeatDue = !opts.lastAiRunAtMs || nowMs - opts.lastAiRunAtMs >= Math.max(45, opts.heartbeatIntervalSec ?? 180) * 1e3;
  if (motionGateEnabled && !opts.forceAi && !hasMotion && !withinTrackingTail && !heartbeatDue && opts.cachedDetection) {
    perfTracker.recordMotionGateSkip(cameraId);
    metrics.motionGateSkipped = true;
    return {
      objects: opts.cachedDetection.objects,
      bboxes: opts.cachedDetection.bboxes,
      metrics,
      width,
      height,
      totalObjects: opts.cachedDetection.totalObjects,
      personCount: opts.cachedDetection.personCount,
      vehicleCount: opts.cachedDetection.vehicleCount,
      motionPct: metrics.motionPct,
      sceneSummary: opts.cachedDetection.sceneSummary,
      engineUsed: `Motion-Gate Skip (\u0394 ${metrics.motionPct}% < ${motionThresholdPct}%)`,
      motionGateSkipped: true,
      inferenceMs: 0
    };
  }
  const isPureJsCpu = true;
  const configuredW = Math.max(224, Math.min(800, Number(opts.aiInputWidth) || 640));
  const effectiveStage1W = isPureJsCpu ? Math.min(300, configuredW) : configuredW;
  const targetW = Math.min(effectiveStage1W, width);
  const targetH = Math.max(1, Math.round(height / width * targetW));
  const fullRgb = resampleRgbaRegionToRgbBuffer(
    rgba,
    width,
    height,
    0,
    0,
    width,
    height,
    targetW,
    targetH
  );
  const defaultMinScore = mode === "Personen" || mode === "Fahrzeuge" ? 0.42 : 0.45;
  const minScore = Math.max(0.25, Math.min(0.95, Number(opts.minConfidence) || defaultMinScore));
  const candidateMinScore = Math.max(0.32, minScore - 0.04);
  const candidates = [];
  let roiZoomApplied = false;
  const tInf0 = performance.now();
  const fullPreds = await detectViaWorkerOrFallback(fullRgb, targetW, targetH, 25, candidateMinScore);
  for (const p of fullPreds) {
    const [bx, by, bw, bh] = p.bbox;
    candidates.push({
      class: p.class,
      score: p.score,
      normX: Math.max(0, Math.min(1, bx / targetW)),
      normY: Math.max(0, Math.min(1, by / targetH)),
      normW: Math.max(0.015, Math.min(1, bw / targetW)),
      normH: Math.max(0.02, Math.min(1, bh / targetH)),
      fromRoiZoom: false
    });
  }
  if (!isPureJsCpu && metrics.motionBoxes.length > 0 && width >= 640) {
    const topMotion = metrics.motionBoxes.slice(0, 2);
    let uX0 = Math.min(...topMotion.map((m) => m.x));
    let uY0 = Math.min(...topMotion.map((m) => m.y));
    let uX1 = Math.max(...topMotion.map((m) => m.x + m.w));
    let uY1 = Math.max(...topMotion.map((m) => m.y + m.h));
    const unionArea = (uX1 - uX0) * (uY1 - uY0);
    if (unionArea < 0.62) {
      const centerX = (uX0 + uX1) / 2;
      const centerY = (uY0 + uY1) / 2;
      const roiSpan = Math.max(0.36, Math.min(0.68, Math.max(uX1 - uX0, uY1 - uY0) + 0.16));
      const roiX0 = Math.max(0, Math.min(1 - roiSpan, centerX - roiSpan / 2));
      const roiY0 = Math.max(0, Math.min(1 - roiSpan, centerY - roiSpan / 2));
      const roiW = Math.min(1 - roiX0, roiSpan);
      const roiH = Math.min(1 - roiY0, roiSpan);
      const cropPxX = Math.floor(roiX0 * width);
      const cropPxY = Math.floor(roiY0 * height);
      const cropPxW = Math.max(160, Math.floor(roiW * width));
      const cropPxH = Math.max(120, Math.floor(roiH * height));
      const roiDstW = Math.min(320, cropPxW);
      const roiDstH = Math.max(120, Math.round(cropPxH / cropPxW * roiDstW));
      const roiRgb = resampleRgbaRegionToRgbBuffer(
        rgba,
        width,
        height,
        cropPxX,
        cropPxY,
        cropPxW,
        cropPxH,
        roiDstW,
        roiDstH
      );
      const roiPreds = await detectViaWorkerOrFallback(roiRgb, roiDstW, roiDstH, 15, candidateMinScore);
      roiZoomApplied = true;
      for (const rp of roiPreds) {
        const [rx, ry, rw, rh] = rp.bbox;
        const touchesCropEdge = rx <= 2 || ry <= 2 || rx + rw >= roiDstW - 2 || ry + rh >= roiDstH - 2;
        if (touchesCropEdge && rp.score < minScore + 0.08) continue;
        candidates.push({
          class: rp.class,
          score: rp.score,
          normX: Math.max(0, Math.min(1, roiX0 + rx / roiDstW * roiW)),
          normY: Math.max(0, Math.min(1, roiY0 + ry / roiDstH * roiH)),
          normW: Math.max(0.015, Math.min(1, rw / roiDstW * roiW)),
          normH: Math.max(0.02, Math.min(1, rh / roiDstH * roiH)),
          fromRoiZoom: true
        });
      }
    }
  }
  const inferenceMs = Math.round(performance.now() - tInf0);
  perfTracker.recordCocoRun(cameraId, inferenceMs);
  let allowedClasses = null;
  if (opts.targetClassesJson) {
    try {
      const parsed = JSON.parse(opts.targetClassesJson);
      if (Array.isArray(parsed) && parsed.length > 0 && mode !== "Objekte") {
        allowedClasses = new Set(parsed.map((c) => String(c).toLowerCase()));
      }
    } catch {
    }
  }
  const validCandidates = candidates.filter((c) => {
    const area = c.normW * c.normH;
    if (area > 0.82 || c.normW < 0.015 || c.normH < 0.02) return false;
    const isClutter = CLUTTER_BACKGROUND_CLASSES.has(c.class);
    const classMinScore = isClutter ? Math.max(minScore, 0.62) : c.class === "person" || VEHICLE_CLASSES.has(c.class) || ANIMAL_CLASSES.has(c.class) ? minScore : Math.max(minScore, 0.48);
    if (c.score < classMinScore) return false;
    if (mode === "Personen") return c.class === "person";
    if (mode === "Fahrzeuge") return VEHICLE_CLASSES.has(c.class) || c.class === "person";
    if (mode === "Aktivit\xE4ten") {
      if (allowedClasses) return allowedClasses.has(c.class);
      return !isClutter;
    }
    return true;
  }).sort((a, b) => b.score - a.score);
  const dedupedPreds = [];
  for (const cand of validCandidates) {
    const candBox = { x: cand.normX, y: cand.normY, w: cand.normW, h: cand.normH };
    const duplicate = dedupedPreds.some(
      (existing) => existing.class === cand.class && computeBoxIoU(candBox, {
        x: existing.normX,
        y: existing.normY,
        w: existing.normW,
        h: existing.normH
      }) > 0.45
    );
    if (!duplicate) {
      dedupedPreds.push(cand);
    }
  }
  const prevPhantoms = staticPhantomTracker.get(cameraId) || [];
  const nextPhantoms = [];
  const filteredPreds = dedupedPreds.filter((p) => {
    const pBox = { x: p.normX, y: p.normY, w: p.normW, h: p.normH };
    const matchedPrev = prevPhantoms.find(
      (prev) => prev.rawClass === p.class && computeBoxIoU(pBox, prev) > 0.86
    );
    const staticCount = matchedPrev ? matchedPrev.staticCount + 1 : 1;
    nextPhantoms.push({
      rawClass: p.class,
      ...pBox,
      staticCount
    });
    if (p.class !== "person" && mode === "Aktivit\xE4ten" && staticCount >= 4 && metrics.motionPct < motionThresholdPct && p.score < 0.7) {
      return false;
    }
    return true;
  });
  staticPhantomTracker.set(cameraId, nextPhantoms.slice(0, 20));
  const bboxes = filteredPreds.map((p) => {
    const category = p.class === "person" ? "person" : VEHICLE_CLASSES.has(p.class) ? "vehicle" : ANIMAL_CLASSES.has(p.class) ? "animal" : "object";
    return {
      x: Math.round(p.normX * 1e3) / 1e3,
      y: Math.round(p.normY * 1e3) / 1e3,
      w: Math.round(p.normW * 1e3) / 1e3,
      h: Math.round(p.normH * 1e3) / 1e3,
      label: GERMAN_LABELS[p.class] || p.class,
      rawClass: p.class,
      confidence: Math.round(p.score * 100) / 100,
      category
    };
  });
  const grouped = /* @__PURE__ */ new Map();
  for (let i = 0; i < filteredPreds.length; i++) {
    const p = filteredPreds[i];
    const box = bboxes[i];
    const centerX = p.normX + p.normW / 2;
    const posH = centerX < 0.35 ? "links" : centerX > 0.65 ? "rechts" : "mitte";
    const areaPct = Math.max(1, Math.round(p.normW * p.normH * 100));
    const zoomTag = p.fromRoiZoom ? " [ROI-Zoom]" : "";
    const deLabel = GERMAN_LABELS[p.class] || p.class;
    const existing = grouped.get(p.class);
    if (existing) {
      existing.count += 1;
      existing.confidence = Math.max(existing.confidence, Math.round(p.score * 100) / 100);
      existing.positions.push(`${posH} (${areaPct}%)${zoomTag}`);
      existing.bboxes.push(box);
    } else {
      grouped.set(p.class, {
        label: deLabel,
        rawClass: p.class,
        confidence: Math.round(p.score * 100) / 100,
        count: 1,
        positions: [`${posH} (${areaPct}%)${zoomTag}`],
        bboxes: [box]
      });
    }
  }
  const objects = Array.from(grouped.values()).map((g) => ({
    label: g.label,
    rawClass: g.rawClass,
    confidence: g.confidence,
    count: g.count,
    details: g.positions.join(", "),
    bboxes: g.bboxes
  }));
  const personCount = filteredPreds.filter((p) => p.class === "person").length;
  const vehicleCount = filteredPreds.filter((p) => VEHICLE_CLASSES.has(p.class)).length;
  const totalObjects = objects.reduce((acc, o) => acc + o.count, 0);
  let sceneSummary = "";
  if (mode === "Personen") {
    sceneSummary = personCount > 0 ? `${personCount} ${personCount === 1 ? "Person" : "Personen"} im Sichtfeld erkannt (${objects[0]?.details || "Mitte"})` : `Keine Personen im Sichtfeld (${metrics.lightingMode}, Helligkeit ${metrics.luminancePct}%)`;
  } else if (mode === "Fahrzeuge") {
    sceneSummary = vehicleCount > 0 ? `${vehicleCount} ${vehicleCount === 1 ? "Fahrzeug" : "Fahrzeuge"} erkannt (${objects.map((o) => `${o.count}\xD7 ${o.label}`).join(", ")})` : personCount > 0 ? `Keine Fahrzeuge, aber ${personCount} Person(en) erkannt` : `Freie Fl\xE4che \u2013 keine Fahrzeuge erkannt (${metrics.lightingMode})`;
  } else if (mode === "Kamera") {
    sceneSummary = metrics.occlusionAlert ? `Kamera-Warnung: Niedriger Kontrast/Sch\xE4rfe (${metrics.sharpnessScore}% Sch\xE4rfe, ${metrics.luminancePct}% Helligkeit)` : `Optik OK \xB7 Sch\xE4rfe ${metrics.sharpnessScore}% \xB7 Kontrast ${metrics.contrastScore}% \xB7 ${metrics.lightingMode} (${metrics.luminancePct}%)`;
  } else if (mode === "Aktivit\xE4ten") {
    if (metrics.motionPct >= motionThresholdPct || personCount > 0) {
      sceneSummary = `Aktivit\xE4t (\u0394 ${metrics.motionPct}%, Zone: ${metrics.activeMotionZone})${totalObjects > 0 ? ` \xB7 ${objects.map((o) => `${o.count}\xD7 ${o.label}`).join(", ")}` : ""}`;
    } else {
      sceneSummary = `Ruhige Szene (\u0394 ${metrics.motionPct}%)${totalObjects > 0 ? ` \xB7 ${objects.map((o) => `${o.count}\xD7 ${o.label}`).join(", ")}` : ""}`;
    }
  } else {
    sceneSummary = totalObjects > 0 ? `${totalObjects} ${totalObjects === 1 ? "Objekt" : "Objekte"}: ${objects.map((o) => `${o.count}\xD7 ${o.label} (${Math.round(o.confidence * 100)}%)`).join(", ")}` : `Keine Zielobjekte erkannt (${metrics.lightingMode}, Sch\xE4rfe ${metrics.sharpnessScore}%)`;
  }
  return {
    objects,
    bboxes,
    metrics,
    width,
    height,
    totalObjects,
    personCount,
    vehicleCount,
    motionPct: metrics.motionPct,
    sceneSummary,
    engineUsed: `MobileNetV2 (${mode}, ${targetW}px${roiZoomApplied ? " + ROI-Zoom" : ""})`,
    motionGateSkipped: false,
    inferenceMs
  };
}
async function requestHaHlsStreamUrl(haUrl, haToken, entityId) {
  return new Promise((resolve) => {
    try {
      const wsUrl = haUrl.replace(/^http/, "ws") + "/api/websocket";
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {
        }
        resolve(null);
      }, 6e3);
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          if (msg.type === "auth_required") {
            ws.send(JSON.stringify({ type: "auth", access_token: haToken }));
          } else if (msg.type === "auth_ok") {
            ws.send(JSON.stringify({ id: 1, type: "camera/stream", entity_id: entityId }));
          } else if (msg.id === 1) {
            clearTimeout(timer);
            ws.close();
            if (msg.success && msg.result?.url) {
              resolve(`${haUrl}${msg.result.url}`);
            } else {
              resolve(null);
            }
          }
        } catch {
          clearTimeout(timer);
          resolve(null);
        }
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}
function isWithinTimeWindow(timeWindow, now = /* @__PURE__ */ new Date()) {
  const tw = (timeWindow || "always").trim().toLowerCase();
  if (!tw || tw === "always") return true;
  const curMinutes = now.getHours() * 60 + now.getMinutes();
  if (tw === "night") {
    return curMinutes >= 22 * 60 || curMinutes < 6 * 60;
  }
  if (tw === "day") {
    return curMinutes >= 6 * 60 && curMinutes < 22 * 60;
  }
  const customMatch = tw.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (customMatch) {
    const startM = Number(customMatch[1]) * 60 + Number(customMatch[2]);
    const endM = Number(customMatch[3]) * 60 + Number(customMatch[4]);
    if (startM <= endM) {
      return curMinutes >= startM && curMinutes <= endM;
    }
    return curMinutes >= startM || curMinutes <= endM;
  }
  return true;
}
function interpolateTriggerTemplate(raw, vars) {
  if (!raw) return "";
  let out = raw;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
  }
  return out;
}
var index_default = defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS camera_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      room TEXT NOT NULL DEFAULT 'Allgemein',
      source_type TEXT NOT NULL DEFAULT 'ha_entity',
      stream_url TEXT NOT NULL DEFAULT '',
      lan_ip TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      sample_interval_sec INTEGER NOT NULL DEFAULT 300,
      optimization_mode TEXT NOT NULL DEFAULT 'Personen',
      target_classes TEXT NOT NULL DEFAULT '["person","car","package","animal"]',
      last_sampled_at TEXT NOT NULL DEFAULT '',
      last_status TEXT NOT NULL DEFAULT 'unprobed',
      last_error TEXT NOT NULL DEFAULT '',
      min_confidence REAL NOT NULL DEFAULT 0.25,
      motion_gate_enabled INTEGER NOT NULL DEFAULT 1,
      motion_threshold_pct REAL NOT NULL DEFAULT 0.8,
      pixel_diff_threshold INTEGER NOT NULL DEFAULT 15,
      ai_input_width INTEGER NOT NULL DEFAULT 300,
      log_cooldown_sec INTEGER NOT NULL DEFAULT 30,
      high_freq_poll_sec INTEGER NOT NULL DEFAULT 3
    );

    CREATE TABLE IF NOT EXISTS vision_detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id TEXT NOT NULL,
      camera_name TEXT NOT NULL,
      optimization_mode TEXT NOT NULL DEFAULT 'Objekte',
      sampled_at TEXT NOT NULL,
      status TEXT NOT NULL,
      objects_json TEXT NOT NULL DEFAULT '[]',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      total_objects INTEGER NOT NULL DEFAULT 0,
      person_count INTEGER NOT NULL DEFAULT 0,
      vehicle_count INTEGER NOT NULL DEFAULT 0,
      motion_pct REAL NOT NULL DEFAULT 0,
      scene_summary TEXT NOT NULL DEFAULT '',
      engine_used TEXT NOT NULL DEFAULT '',
      processing_ms INTEGER NOT NULL DEFAULT 0,
      snapshot_b64 TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS vision_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      camera_id TEXT NOT NULL DEFAULT '*',
      object_class TEXT NOT NULL DEFAULT 'person',
      min_confidence_pct INTEGER NOT NULL DEFAULT 60,
      min_count INTEGER NOT NULL DEFAULT 1,
      min_motion_pct REAL NOT NULL DEFAULT 0,
      time_window TEXT NOT NULL DEFAULT 'always',
      cooldown_sec INTEGER NOT NULL DEFAULT 60,
      action_type TEXT NOT NULL DEFAULT 'axon',
      action_target TEXT NOT NULL DEFAULT 'ha.call_service',
      action_payload_json TEXT NOT NULL DEFAULT '{}',
      last_triggered_at TEXT NOT NULL DEFAULT '',
      last_status TEXT NOT NULL DEFAULT 'idle',
      last_result TEXT NOT NULL DEFAULT '',
      trigger_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS vision_trigger_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_id INTEGER NOT NULL,
      trigger_name TEXT NOT NULL,
      camera_id TEXT NOT NULL,
      camera_name TEXT NOT NULL,
      matched_object TEXT NOT NULL,
      matched_confidence_pct INTEGER NOT NULL,
      matched_count INTEGER NOT NULL,
      motion_pct REAL NOT NULL DEFAULT 0,
      action_type TEXT NOT NULL,
      action_target TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      result_summary TEXT NOT NULL DEFAULT '',
      fired_at TEXT NOT NULL
    );
  `);
  const camCols = ctx.db.query("PRAGMA table_info(camera_sources)").map((c) => c.name);
  const addCamCol = (col, defSql) => {
    if (!camCols.includes(col)) {
      ctx.db.exec(`ALTER TABLE camera_sources ADD COLUMN ${col} ${defSql};`);
    }
  };
  addCamCol("optimization_mode", `TEXT NOT NULL DEFAULT 'Personen'`);
  addCamCol("min_confidence", `REAL NOT NULL DEFAULT 0.25`);
  addCamCol("motion_gate_enabled", `INTEGER NOT NULL DEFAULT 1`);
  addCamCol("motion_threshold_pct", `REAL NOT NULL DEFAULT 0.8`);
  addCamCol("pixel_diff_threshold", `INTEGER NOT NULL DEFAULT 15`);
  addCamCol("ai_input_width", `INTEGER NOT NULL DEFAULT 300`);
  addCamCol("log_cooldown_sec", `INTEGER NOT NULL DEFAULT 30`);
  addCamCol("high_freq_poll_sec", `INTEGER NOT NULL DEFAULT 3`);
  const detCols = ctx.db.query("PRAGMA table_info(vision_detections)").map((c) => c.name);
  if (!detCols.includes("optimization_mode")) {
    ctx.db.exec(
      `ALTER TABLE vision_detections ADD COLUMN optimization_mode TEXT NOT NULL DEFAULT 'Objekte';`
    );
  }
  if (!detCols.includes("metrics_json")) {
    ctx.db.exec(`ALTER TABLE vision_detections ADD COLUMN metrics_json TEXT NOT NULL DEFAULT '{}';`);
  }
  if (!detCols.includes("vehicle_count")) {
    ctx.db.exec(
      `ALTER TABLE vision_detections ADD COLUMN vehicle_count INTEGER NOT NULL DEFAULT 0;`
    );
  }
  if (!detCols.includes("motion_pct")) {
    ctx.db.exec(`ALTER TABLE vision_detections ADD COLUMN motion_pct REAL NOT NULL DEFAULT 0;`);
  }
  ctx.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_vision_detections_cam_id ON vision_detections(camera_id, id DESC);`
  );
  function seedCamerasAndTriggers() {
    const count = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM camera_sources")?.cnt ?? 0;
    if (count === 0) {
      for (const c of DEFAULT_CAMERAS) {
        ctx.db.execute(
          `INSERT INTO camera_sources
           (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, optimization_mode, target_classes, last_sampled_at, last_status, last_error, min_confidence, motion_gate_enabled, motion_threshold_pct, pixel_diff_threshold, ai_input_width, log_cooldown_sec, high_freq_poll_sec)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '', ?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id,
            c.name,
            c.room,
            c.source_type,
            c.stream_url,
            c.lan_ip,
            c.enabled,
            c.sample_interval_sec,
            c.optimization_mode,
            c.target_classes,
            c.min_confidence,
            c.motion_gate_enabled,
            c.motion_threshold_pct,
            c.pixel_diff_threshold,
            c.ai_input_width,
            c.log_cooldown_sec,
            c.high_freq_poll_sec
          ]
        );
      }
    }
    const trigCount = ctx.db.queryOne("SELECT COUNT(*) as cnt FROM vision_triggers")?.cnt ?? 0;
    if (trigCount === 0) {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const starterTriggers = [
        {
          name: "Person im Eingangsbereich erkannt (>= 65%)",
          enabled: 1,
          camera_id: "camera.cam_eg_vz_eingang",
          object_class: "person",
          min_confidence_pct: 65,
          min_count: 1,
          min_motion_pct: 0.5,
          time_window: "always",
          cooldown_sec: 60,
          action_type: "axon",
          action_target: "ha.call_service",
          action_payload_json: JSON.stringify({
            domain: "persistent_notification",
            service: "create",
            targetOrMessage: "[Vision Trigger] {{count}}\xD7 {{object_label}} ({{confidence_pct}}%) auf {{camera_name}} ({{room}}) erkannt \xB7 \u0394 {{motion_pct}}%"
          })
        },
        {
          name: "Fahrzeug auf Parkplatz / Werkstatt (>= 60%)",
          enabled: 1,
          camera_id: "camera.garten_parkplatz_kamera",
          object_class: "any_vehicle",
          min_confidence_pct: 60,
          min_count: 1,
          min_motion_pct: 0.6,
          time_window: "always",
          cooldown_sec: 120,
          action_type: "axon",
          action_target: "system.notes.manage",
          action_payload_json: JSON.stringify({
            action: "add",
            content: "[Vision-Trigger Parkplatz] {{count}}\xD7 {{object_label}} ({{confidence_pct}}%) um {{timestamp}} erkannt ({{scene_summary}})"
          })
        },
        {
          name: "Nacht-Alarm: Person erkannt -> Vorzimmer Alert-LED",
          enabled: 0,
          camera_id: "*",
          object_class: "person",
          min_confidence_pct: 55,
          min_count: 1,
          min_motion_pct: 0.5,
          time_window: "night",
          cooldown_sec: 90,
          action_type: "ha_service",
          action_target: "light.turn_on",
          action_payload_json: JSON.stringify({
            entity_id: "light.vorzimmer_og_alert_led",
            brightness_pct: 100
          })
        }
      ];
      for (const t of starterTriggers) {
        ctx.db.execute(
          `INSERT INTO vision_triggers
           (name, enabled, camera_id, object_class, min_confidence_pct, min_count, min_motion_pct, time_window, cooldown_sec, action_type, action_target, action_payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.name,
            t.enabled,
            t.camera_id,
            t.object_class,
            t.min_confidence_pct,
            t.min_count,
            t.min_motion_pct,
            t.time_window,
            t.cooldown_sec,
            t.action_type,
            t.action_target,
            t.action_payload_json,
            nowIso
          ]
        );
      }
    }
  }
  seedCamerasAndTriggers();
  if (!ctx.db.kvGet("vision_v2_motion_coco_upgrade")) {
    ctx.db.execute(
      `UPDATE camera_sources
       SET min_confidence = CASE WHEN min_confidence <= 0.30 THEN 0.45 ELSE min_confidence END,
           motion_threshold_pct = CASE
             WHEN motion_threshold_pct <= 1.2 AND (room LIKE '%Au\xDFen%' OR room LIKE '%Garten%' OR room LIKE '%Werkstatt%') THEN 2.8
             WHEN motion_threshold_pct <= 1.2 THEN 2.2
             ELSE motion_threshold_pct
           END,
           pixel_diff_threshold = CASE
             WHEN pixel_diff_threshold <= 18 AND (room LIKE '%Au\xDFen%' OR room LIKE '%Garten%' OR room LIKE '%Werkstatt%') THEN 26
             WHEN pixel_diff_threshold <= 18 THEN 24
             ELSE pixel_diff_threshold
           END,
           ai_input_width = CASE WHEN ai_input_width <= 320 THEN 640 ELSE ai_input_width END`
    );
    ctx.db.kvSet("vision_v2_motion_coco_upgrade", true);
  }
  try {
    ctx.db.execute(
      `DELETE FROM vision_detections WHERE id <= (SELECT IFNULL(MAX(id), 0) - 120 FROM vision_detections)`
    );
    ctx.db.execute(
      `UPDATE vision_detections SET snapshot_b64 = '' WHERE id <= (SELECT IFNULL(MAX(id), 0) - 30 FROM vision_detections) AND snapshot_b64 != ''`
    );
  } catch {
  }
  try {
    const prevCfg = ctx.db.kvGet("vision_config");
    if (prevCfg && (prevCfg.cyclicEnabled || prevCfg.highFreqMotionLoopEnabled)) {
      ctx.db.kvSet("vision_config", {
        ...prevCfg,
        cyclicEnabled: false,
        highFreqMotionLoopEnabled: false
      });
    }
  } catch {
  }
  function getConfig() {
    const saved = ctx.db.kvGet("vision_config") || {};
    return {
      cyclicEnabled: saved.cyclicEnabled ?? false,
      highFreqMotionLoopEnabled: saved.highFreqMotionLoopEnabled ?? false,
      intervalSeconds: saved.intervalSeconds ?? 180,
      highFreqTickMs: saved.highFreqTickMs ?? 2500,
      visionEngine: "local_coco_ssd",
      go2rtcUrl: saved.go2rtcUrl || "http://192.168.188.92:1984"
    };
  }
  function getHaConnection() {
    const saved = ctx.sharedDb.kvGet("ha_connection") || {};
    return {
      haUrl: (saved.haUrl || process.env.HA_URL || (process.env.SUPERVISOR_TOKEN ? "http://supervisor/core" : "http://192.168.188.92:8123")).replace(/\/+$/, ""),
      haToken: saved.haToken || process.env.HA_TOKEN || process.env.SUPERVISOR_TOKEN || ""
    };
  }
  const hlsStreamCache = /* @__PURE__ */ new Map();
  const liveLumaGrids = /* @__PURE__ */ new Map();
  const rawStreamBufferCache = /* @__PURE__ */ new Map();
  const liveFrameCache = /* @__PURE__ */ new Map();
  const latestDetectionBoxesCache = /* @__PURE__ */ new Map();
  const lastAiRunAtMsMap = /* @__PURE__ */ new Map();
  const lastPositiveObjectAtMsMap = /* @__PURE__ */ new Map();
  const lastDbLogAtMsMap = /* @__PURE__ */ new Map();
  const lastHighFreqPollAtMsMap = /* @__PURE__ */ new Map();
  const lanStatusCache = /* @__PURE__ */ new Map();
  const inFlightFrameRequests = /* @__PURE__ */ new Map();
  const inFlightDetectRequests = /* @__PURE__ */ new Map();
  const activeStreamWorkers = /* @__PURE__ */ new Map();
  function ingestStreamJpegBuffer(cam, jpegBuf, methodLabel) {
    try {
      if (jpegBuf.byteLength < 250) return;
      const nowMs = Date.now();
      const prevRaw = rawStreamBufferCache.get(cam.id);
      const captureMs = prevRaw ? Math.max(25, Math.min(2500, nowMs - prevRaw.capturedAtMs)) : 120;
      const frameSeq = (prevRaw?.frameSeq || 0) + 1;
      const nowIso = new Date(nowMs).toISOString();
      rawStreamBufferCache.set(cam.id, {
        buffer: jpegBuf,
        mimeType: "image/jpeg",
        method: methodLabel,
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq
      });
      perfTracker.recordRawIngest(cam.id, captureMs);
      const prevDecoded = liveFrameCache.get(cam.id);
      if (prevDecoded && nowMs - prevDecoded.capturedAtMs < 480) {
        return;
      }
      const { width, height, rgba, decodeMs } = decodeImageBuffer(jpegBuf, "image/jpeg");
      const metrics = analyzePixelMetricsAndMotion(
        cam.id,
        width,
        height,
        rgba,
        liveLumaGrids,
        cam.pixel_diff_threshold ?? 15,
        decodeMs
      );
      const b64 = jpegBuf.toString("base64");
      liveFrameCache.set(cam.id, {
        buffer: jpegBuf,
        b64,
        mimeType: "image/jpeg",
        width,
        height,
        metrics,
        method: methodLabel,
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq
      });
    } catch {
    }
  }
  function ensureLiveStreamWorker(cam) {
    if (process.env.THASSI_ENABLE_BG_VISION !== "1") return;
    if (!cam.id.startsWith("camera.")) return;
    const existing = activeStreamWorkers.get(cam.id);
    if (existing) {
      existing.lastAccessMs = Date.now();
      return;
    }
    const { haUrl, haToken } = getHaConnection();
    if (!haToken) return;
    const abort = new AbortController();
    const state = { lastAccessMs: Date.now(), abort, frameCount: 0 };
    activeStreamWorkers.set(cam.id, state);
    const idleTimer = setInterval(() => {
      if (Date.now() - state.lastAccessMs > 45e3) {
        clearInterval(idleTimer);
        activeStreamWorkers.delete(cam.id);
        try {
          abort.abort();
        } catch {
        }
      }
    }, 5e3);
    void (async () => {
      try {
        const streamUrl = `${haUrl}/api/camera_proxy_stream/${encodeURIComponent(cam.id)}`;
        const res = await fetch(streamUrl, {
          headers: { Authorization: `Bearer ${haToken}` },
          signal: abort.signal
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        let acc = Buffer.alloc(0);
        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          acc = acc.length === 0 ? Buffer.from(value) : Buffer.concat([acc, Buffer.from(value)]);
          while (acc.length > 512) {
            const soi = acc.indexOf(JPEG_SOI);
            if (soi === -1) {
              if (acc.length > 4096) acc = acc.subarray(acc.length - 16);
              break;
            }
            if (soi > 0) {
              acc = acc.subarray(soi);
            }
            if (acc.length < 260) break;
            const eoiIdx = acc.indexOf(JPEG_EOI, 256);
            if (eoiIdx === -1) {
              if (acc.length > 2e6) acc = Buffer.alloc(0);
              break;
            }
            const frameEnd = eoiIdx + 2;
            const jpegFrame = Buffer.from(acc.subarray(0, frameEnd));
            acc = acc.subarray(frameEnd);
            state.frameCount++;
            ingestStreamJpegBuffer(cam, jpegFrame, "ha_mjpeg_stream");
          }
        }
      } catch {
      } finally {
        clearInterval(idleTimer);
        activeStreamWorkers.delete(cam.id);
      }
    })();
  }
  async function grabFrameViaGo2RtcHls(camId, haUrl, haToken, go2rtcBaseUrl) {
    const now = Date.now();
    const cached = hlsStreamCache.get(camId);
    const tryFetchFromGo2Rtc = async (src, methodLabel) => {
      try {
        const go2Url = `${go2rtcBaseUrl}/api/frame.jpeg?src=${encodeURIComponent(src)}`;
        const gr = await fetch(go2Url, { signal: AbortSignal.timeout(6500) });
        if (gr.ok) {
          const buf = Buffer.from(await gr.arrayBuffer());
          if (buf.byteLength > 200) {
            return { ok: true, buffer: buf, mimeType: "image/jpeg", method: methodLabel };
          }
        }
      } catch {
      }
      return { ok: false };
    };
    if (cached && now - cached.registeredAt < 24e4) {
      const fastRes = await tryFetchFromGo2Rtc(cached.hlsUrl, "go2rtc_hls_cached");
      if (fastRes.ok && fastRes.buffer) {
        return { ...fastRes, hlsUrl: cached.hlsUrl };
      }
      hlsStreamCache.delete(camId);
    }
    const freshHlsUrl = await requestHaHlsStreamUrl(haUrl, haToken, camId);
    if (!freshHlsUrl) return { ok: false };
    hlsStreamCache.set(camId, { hlsUrl: freshHlsUrl, registeredAt: Date.now() });
    try {
      await fetch(
        `${go2rtcBaseUrl}/api/streams?name=${encodeURIComponent(camId)}&src=${encodeURIComponent(freshHlsUrl)}`,
        { method: "PUT", signal: AbortSignal.timeout(2e3) }
      );
    } catch {
    }
    const freshRes = await tryFetchFromGo2Rtc(freshHlsUrl, "ha_hls_go2rtc");
    if (freshRes.ok && freshRes.buffer) {
      return { ...freshRes, hlsUrl: freshHlsUrl };
    }
    return { ok: false };
  }
  let cachedHaCameraStates = {
    fetchedAtMs: 0,
    map: /* @__PURE__ */ new Map()
  };
  const cameraProxyBackoffMap = /* @__PURE__ */ new Map();
  async function getCachedHaCameraStateMap() {
    const now = Date.now();
    if (now - cachedHaCameraStates.fetchedAtMs < 2e4 && cachedHaCameraStates.map.size > 0) {
      return cachedHaCameraStates.map;
    }
    const states = await ctx.ha.getStates("camera").catch(() => []);
    const map = /* @__PURE__ */ new Map();
    for (const s of states) {
      map.set(s.entity_id, s.state);
    }
    cachedHaCameraStates = { fetchedAtMs: now, map };
    return map;
  }
  async function acquireCameraSnapshot(cam, cfg) {
    const { haUrl, haToken } = getHaConnection();
    const go2Base = cfg.go2rtcUrl.replace(/\/+$/, "");
    const rawCached = rawStreamBufferCache.get(cam.id);
    if (rawCached && Date.now() - rawCached.capturedAtMs < 1800) {
      return {
        ok: true,
        buffer: rawCached.buffer,
        mimeType: rawCached.mimeType,
        method: rawCached.method
      };
    }
    if (cam.stream_url && cam.stream_url.trim()) {
      const url = cam.stream_url.trim();
      try {
        if (url.startsWith("http://") || url.startsWith("https://")) {
          const r = await fetch(url, { signal: AbortSignal.timeout(4e3) });
          const ct = r.headers.get("content-type") || "";
          if (r.ok && ct.startsWith("image/")) {
            const buf = Buffer.from(await r.arrayBuffer());
            perfTracker.recordRawIngest(cam.id, 120);
            return {
              ok: true,
              buffer: buf,
              mimeType: ct.split(";")[0],
              method: "direct_http"
            };
          }
        }
        const go2Url = `${go2Base}/api/frame.jpeg?src=${encodeURIComponent(url)}`;
        const gr = await fetch(go2Url, { signal: AbortSignal.timeout(4500) });
        if (gr.ok) {
          const buf = Buffer.from(await gr.arrayBuffer());
          if (buf.byteLength > 200) {
            perfTracker.recordRawIngest(cam.id, 140);
            return { ok: true, buffer: buf, mimeType: "image/jpeg", method: "go2rtc_frame" };
          }
        }
      } catch {
      }
    }
    if (cam.id.startsWith("camera.")) {
      const stateMap = await getCachedHaCameraStateMap();
      const haState = stateMap.get(cam.id);
      if (!haState || haState === "unavailable" || haState === "unknown") {
        const lan6668 = cam.lan_ip ? await checkTcpPort(cam.lan_ip, 6668, 300) : false;
        return {
          ok: false,
          error: lan6668 ? `Kamera im WLAN aktiv (${cam.lan_ip}:6668) \u2013 wartet auf Tuya QR-Code Re-Authentifizierung in Home Assistant` : `Kamera in Home Assistant '${haState || "nicht geladen"}' (Tuya QR-Code Re-Auth ausstehend oder Kamera ausgeschaltet)`
        };
      }
      const backoff = cameraProxyBackoffMap.get(cam.id);
      if (backoff && Date.now() < backoff.untilMs) {
        return {
          ok: false,
          error: backoff.reason
        };
      }
    }
    if (cam.id.startsWith("camera.") && haToken) {
      try {
        const t0 = Date.now();
        const proxyUrl = `${haUrl}/api/camera_proxy/${encodeURIComponent(cam.id)}`;
        const r = await fetch(proxyUrl, {
          headers: { Authorization: `Bearer ${haToken}` },
          signal: AbortSignal.timeout(4500)
        });
        const ct = r.headers.get("content-type") || "";
        if (r.ok && ct.startsWith("image/")) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.byteLength > 200) {
            cameraProxyBackoffMap.delete(cam.id);
            perfTracker.recordRawIngest(cam.id, Date.now() - t0);
            return {
              ok: true,
              buffer: buf,
              mimeType: ct.split(";")[0],
              method: "ha_camera_proxy"
            };
          }
        }
      } catch {
      }
      const errReason = `Kein Einzelbild von ${cam.id} abrufbar (Tuya Cloud-Stream 404/Timeout \u2013 90s Backoff aktiv)`;
      cameraProxyBackoffMap.set(cam.id, {
        untilMs: Date.now() + 9e4,
        reason: errReason
      });
      return {
        ok: false,
        error: errReason
      };
    }
    return {
      ok: false,
      error: `Kein Einzelbild von ${cam.id} abrufbar (Stream nicht erreichbar)`
    };
  }
  async function executeSingleTriggerAction(trig, cam, matchInfo, appCtx, isDryRunTest = false) {
    const t0 = Date.now();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const vars = {
      camera_id: cam.id,
      camera_name: cam.name,
      room: cam.room,
      object_class: matchInfo.matchedClass,
      object_label: matchInfo.matchedLabel,
      confidence_pct: matchInfo.confidencePct,
      count: matchInfo.count,
      motion_pct: matchInfo.motionPct,
      scene_summary: matchInfo.sceneSummary,
      trigger_name: trig.name,
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString("de-AT"),
      iso_timestamp: nowIso
    };
    const interpolatedRaw = interpolateTriggerTemplate(trig.action_payload_json || "{}", vars);
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(interpolatedRaw);
    } catch {
      parsedPayload = { message: interpolatedRaw };
    }
    const upstreamText = `[Vision Trigger: ${trig.name}] ${cam.name} (${cam.room}): ${matchInfo.count}\xD7 ${matchInfo.matchedLabel} (${matchInfo.confidencePct}% Konfidenz, \u0394 ${matchInfo.motionPct}% Bewegung) \u2014 ${matchInfo.sceneSummary}`;
    let status = "success";
    let resultSummary = "";
    try {
      if (trig.action_type === "axon") {
        const axonId = trig.action_target.trim() || "ha.call_service";
        const axonRes = await appCtx.actions.execute(axonId, parsedPayload, {
          upstreamText
        });
        status = axonRes.status;
        resultSummary = `Axon ${axonId}: ${axonRes.summary}`;
      } else if (trig.action_type === "ha_service") {
        const [domain, service] = trig.action_target.includes(".") ? trig.action_target.split(".", 2) : ["persistent_notification", "create"];
        const serviceData = domain === "persistent_notification" && !parsedPayload.message ? { title: `Thassi Vision: ${cam.name}`, message: upstreamText, ...parsedPayload } : parsedPayload;
        await appCtx.ha.callService(domain, service, serviceData);
        resultSummary = `HA Service ${domain}.${service} ausgef\xFChrt (${JSON.stringify(serviceData).slice(0, 90)})`;
      } else if (trig.action_type === "ha_event") {
        const evName = trig.action_target.trim() || "thassi_camera_vision_trigger";
        await appCtx.ha.fireEvent(evName, {
          ...vars,
          ...parsedPayload,
          dryRun: isDryRunTest
        });
        resultSummary = `HA Event "${evName}" auf Bus publiziert`;
      } else {
        const evt = {
          id: `vis_trig_${Date.now()}`,
          type: "vision.object_detected",
          source: "camera-vision",
          triggerId: trig.id,
          triggerName: trig.name,
          ...vars,
          payload: parsedPayload,
          createdAt: nowIso
        };
        const list = (appCtx.sharedDb.kvGet("orchestrator_events") || []).slice(0, 79);
        list.unshift(evt);
        appCtx.sharedDb.kvSet("orchestrator_events", list);
        appCtx.sharedDb.kvSet("vision_last_trigger", evt);
        resultSummary = `Thassi Orchestrator Event "${trig.name}" publiziert`;
      }
    } catch (err) {
      status = "error";
      resultSummary = err instanceof Error ? err.message : String(err);
    }
    const durationMs = Math.max(1, Date.now() - t0);
    appCtx.db.execute(
      `UPDATE vision_triggers
       SET last_triggered_at = ?, last_status = ?, last_result = ?, trigger_count = trigger_count + 1
       WHERE id = ?`,
      [nowIso, status, resultSummary, trig.id]
    );
    appCtx.db.execute(
      `INSERT INTO vision_trigger_logs
       (trigger_id, trigger_name, camera_id, camera_name, matched_object, matched_confidence_pct, matched_count, motion_pct, action_type, action_target, status, duration_ms, result_summary, fired_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trig.id,
        trig.name,
        cam.id,
        cam.name,
        matchInfo.matchedLabel,
        matchInfo.confidencePct,
        matchInfo.count,
        matchInfo.motionPct,
        trig.action_type,
        trig.action_target,
        status,
        durationMs,
        resultSummary,
        nowIso
      ]
    );
    perfTracker.recordTriggerFired(cam.id);
    return {
      ok: status === "success",
      status,
      summary: resultSummary,
      durationMs
    };
  }
  async function evaluateAndFireVisionTriggers(cam, bboxes, motionPct, sceneSummary, appCtx) {
    const activeTriggers = appCtx.db.query(
      `SELECT * FROM vision_triggers WHERE enabled = 1 AND (camera_id = '*' OR camera_id = ?)`,
      [cam.id]
    );
    if (activeTriggers.length === 0) return [];
    const now = /* @__PURE__ */ new Date();
    const nowMs = now.getTime();
    const firedResults = [];
    for (const trig of activeTriggers) {
      if (trig.last_triggered_at) {
        const lastMs = new Date(trig.last_triggered_at).getTime();
        if (Number.isFinite(lastMs) && nowMs - lastMs < Math.max(5, trig.cooldown_sec) * 1e3) {
          continue;
        }
      }
      if (!isWithinTimeWindow(trig.time_window, now)) {
        continue;
      }
      if (trig.min_motion_pct > 0 && motionPct < trig.min_motion_pct) {
        continue;
      }
      const minConfRatio = Math.max(0.05, Math.min(0.99, (trig.min_confidence_pct || 60) / 100));
      const targetCls = (trig.object_class || "person").toLowerCase().trim();
      if (targetCls === "motion_only") {
        if (motionPct >= Math.max(0.5, trig.min_motion_pct || 1)) {
          const res = await executeSingleTriggerAction(
            trig,
            cam,
            {
              matchedClass: "motion",
              matchedLabel: "Bewegung",
              confidencePct: Math.min(99, Math.round(motionPct * 10)),
              count: 1,
              motionPct,
              sceneSummary
            },
            appCtx
          );
          firedResults.push({ triggerId: trig.id, name: trig.name, ...res });
        }
        continue;
      }
      const matchingBoxes = bboxes.filter((b) => {
        if (b.category === "motion") return false;
        if (b.confidence < minConfRatio) return false;
        const rc = (b.rawClass || "").toLowerCase();
        if (targetCls === "any_object") return true;
        if (targetCls === "any_vehicle") return VEHICLE_CLASSES.has(rc);
        if (targetCls === "any_animal") return ANIMAL_CLASSES.has(rc);
        return rc === targetCls;
      });
      const minRequiredCount = Math.max(1, trig.min_count || 1);
      if (matchingBoxes.length >= minRequiredCount) {
        const bestConf = Math.round(
          Math.max(...matchingBoxes.map((b) => b.confidence)) * 100
        );
        const firstBox = matchingBoxes[0];
        const res = await executeSingleTriggerAction(
          trig,
          cam,
          {
            matchedClass: firstBox.rawClass,
            matchedLabel: GERMAN_LABELS[firstBox.rawClass] || firstBox.label || firstBox.rawClass,
            confidencePct: bestConf,
            count: matchingBoxes.length,
            motionPct,
            sceneSummary
          },
          appCtx
        );
        firedResults.push({ triggerId: trig.id, name: trig.name, ...res });
      }
    }
    return firedResults;
  }
  async function sampleSingleCamera(camId, appCtx, options = {}) {
    const cam = appCtx.db.queryOne(
      "SELECT * FROM camera_sources WHERE id = ?",
      [camId]
    );
    if (!cam) return { error: `Kamera ${camId} nicht gefunden`, camera_id: camId };
    const cfg = getConfig();
    const startMs = Date.now();
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const mode = OPTIMIZATION_MODES.includes(
      cam.optimization_mode
    ) ? cam.optimization_mode : "Objekte";
    const snap = await acquireCameraSnapshot(cam, cfg);
    if (!snap.ok || !snap.buffer) {
      const errMsg = snap.error || "Kein Kamerabild verf\xFCgbar";
      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'offline', last_error = ? WHERE id = ?`,
        [nowIso, errMsg, cam.id]
      );
      return { error: errMsg, camera_id: cam.id };
    }
    try {
      const prevDetCache = latestDetectionBoxesCache.get(cam.id) || null;
      const det = await runLocalCocoSsdPipeline(
        cam.id,
        snap.buffer,
        snap.mimeType || "image/jpeg",
        mode,
        {
          minConfidence: cam.min_confidence ?? 0.25,
          motionGateEnabled: Boolean(cam.motion_gate_enabled ?? 1),
          motionThresholdPct: cam.motion_threshold_pct ?? 0.8,
          pixelDiffThreshold: cam.pixel_diff_threshold ?? 15,
          aiInputWidth: cam.ai_input_width ?? 300,
          targetClassesJson: cam.target_classes,
          forceAi: options.forceAi ?? false,
          cachedDetection: prevDetCache,
          lastAiRunAtMs: lastAiRunAtMsMap.get(cam.id),
          lastPositiveObjectAtMs: lastPositiveObjectAtMsMap.get(cam.id),
          heartbeatIntervalSec: cam.sample_interval_sec || 180
        }
      );
      const elapsed = Date.now() - startMs;
      const nowMs = Date.now();
      if (!det.motionGateSkipped) {
        lastAiRunAtMsMap.set(cam.id, nowMs);
        if (det.totalObjects > 0) {
          lastPositiveObjectAtMsMap.set(cam.id, nowMs);
        }
      }
      const prevObjectCount = prevDetCache?.totalObjects ?? -1;
      latestDetectionBoxesCache.set(cam.id, {
        bboxes: det.bboxes || [],
        objects: det.objects || [],
        sceneSummary: det.sceneSummary,
        personCount: det.personCount,
        vehicleCount: det.vehicleCount,
        totalObjects: det.totalObjects,
        processingMs: elapsed,
        updatedAt: nowIso,
        motionGateSkipped: det.motionGateSkipped
      });
      const thumbB64 = snap.buffer.byteLength <= 35e4 ? snap.buffer.toString("base64") : "";
      if (thumbB64) {
        const frameSeq = (liveFrameCache.get(cam.id)?.frameSeq || 0) + 1;
        liveFrameCache.set(cam.id, {
          buffer: snap.buffer,
          b64: thumbB64,
          mimeType: snap.mimeType || "image/jpeg",
          width: det.width,
          height: det.height,
          metrics: det.metrics,
          method: snap.method || "sample",
          capturedAt: nowIso,
          capturedAtMs: nowMs,
          captureMs: elapsed,
          frameSeq
        });
      }
      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'online', last_error = '' WHERE id = ?`,
        [nowIso, cam.id]
      );
      if (det.totalObjects > 0 || det.motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
        await evaluateAndFireVisionTriggers(
          cam,
          det.bboxes || [],
          det.motionPct,
          det.sceneSummary,
          appCtx
        );
      }
      const lastLogMs = lastDbLogAtMsMap.get(cam.id) || 0;
      const cooldownMs = Math.max(5, cam.log_cooldown_sec ?? 30) * 1e3;
      const objectCountChanged = det.totalObjects !== prevObjectCount && det.totalObjects > 0;
      const shouldPersistToDb = !options.backgroundHighFreq || lastLogMs === 0 || nowMs - lastLogMs >= cooldownMs && (!det.motionGateSkipped || objectCountChanged || nowMs - lastLogMs >= (cam.sample_interval_sec || 180) * 1e3);
      if (!shouldPersistToDb) {
        return {
          skipped: true,
          camera_id: cam.id,
          scene_summary: det.sceneSummary
        };
      }
      lastDbLogAtMsMap.set(cam.id, nowMs);
      const info = appCtx.db.execute(
        `INSERT INTO vision_detections
         (camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64)
         VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cam.id,
          cam.name,
          mode,
          nowIso,
          JSON.stringify(det.objects),
          JSON.stringify(det.metrics),
          det.totalObjects,
          det.personCount,
          det.vehicleCount,
          det.motionPct,
          det.sceneSummary,
          det.engineUsed,
          elapsed,
          thumbB64
        ]
      );
      const rowId = Number(info.lastInsertRowid) || 0;
      if (rowId > 35 && rowId % 5 === 0) {
        try {
          appCtx.db.execute(`DELETE FROM vision_detections WHERE id <= ?`, [rowId - 120]);
          appCtx.db.execute(
            `UPDATE vision_detections SET snapshot_b64 = '' WHERE id <= ? AND snapshot_b64 != ''`,
            [rowId - 30]
          );
        } catch {
        }
      }
      await updateSharedSummaryAndHaSensors(appCtx);
      return appCtx.db.queryOne(
        "SELECT * FROM vision_detections WHERE id = ?",
        [info.lastInsertRowid]
      ) || { error: "Gespeichert", camera_id: cam.id, scene_summary: det.sceneSummary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'vision_error', last_error = ? WHERE id = ?`,
        [nowIso, msg, cam.id]
      );
      return { error: msg, camera_id: cam.id };
    }
  }
  async function updateSharedSummaryAndHaSensors(appCtx) {
    const cameras = appCtx.db.query("SELECT * FROM camera_sources");
    const latestDetections = appCtx.db.query(
      `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms
       FROM vision_detections ORDER BY id DESC LIMIT 15`
    );
    const triggers = appCtx.db.query("SELECT * FROM vision_triggers");
    const onlineCount = cameras.filter((c) => c.last_status === "online").length;
    const lastDet = latestDetections[0] || null;
    const perf = perfTracker.getSnapshot(activeStreamWorkers);
    const cameraModes = {};
    for (const c of cameras) {
      cameraModes[c.id] = c.optimization_mode || "Personen";
    }
    const summary = {
      totalCameras: cameras.length,
      enabledCameras: cameras.filter((c) => c.enabled === 1).length,
      onlineCameras: onlineCount,
      cameraModes,
      activeTriggers: triggers.filter((t) => t.enabled === 1).length,
      totalTriggersFired: perf.totalTriggersFired,
      motionGateSkipRatePct: perf.motionGateSkipRatePct,
      avgInferenceMs: perf.avgInferenceMs,
      lastDetectionAt: lastDet?.sampled_at || null,
      lastCameraName: lastDet?.camera_name || null,
      lastOptimizationMode: lastDet?.optimization_mode || null,
      lastSceneSummary: lastDet?.scene_summary || null,
      lastTotalObjects: lastDet?.total_objects ?? 0,
      lastPersonCount: lastDet?.person_count ?? 0,
      lastVehicleCount: lastDet?.vehicle_count ?? 0,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    appCtx.sharedDb.kvSet("camera_vision_today", summary);
    appCtx.sharedDb.kvSet("camera_vision_performance", perf);
    await appCtx.ha.publishSensor(
      "last_detection",
      lastDet ? `${lastDet.camera_name}: ${lastDet.scene_summary}` : "Bereit (Lokales COCO-SSD)",
      {
        friendly_name: "Thassi Camera Vision Letzte Erkennung",
        icon: "mdi:cctv",
        engine: "Local COCO-SSD (Motion-Gated)",
        online_cameras: onlineCount,
        total_cameras: cameras.length,
        person_count: lastDet?.person_count ?? 0,
        vehicle_count: lastDet?.vehicle_count ?? 0,
        total_objects: lastDet?.total_objects ?? 0,
        motion_gate_skip_pct: perf.motionGateSkipRatePct,
        active_triggers: summary.activeTriggers,
        triggers_fired: perf.totalTriggersFired,
        camera_modes: cameraModes
      }
    ).catch(() => {
    });
  }
  const gVision = globalThis;
  if (gVision.__thassiVisionHighFreqTimer) {
    clearInterval(gVision.__thassiVisionHighFreqTimer);
  }
  if (process.env.THASSI_ENABLE_BG_VISION === "1") {
    void updateSharedSummaryAndHaSensors(ctx);
    let highFreqLoopRunning = false;
    let highFreqRobinIdx = 0;
    gVision.__thassiVisionHighFreqTimer = setInterval(() => {
      if (highFreqLoopRunning) return;
      const cfg = getConfig();
      if (!cfg.cyclicEnabled || !cfg.highFreqMotionLoopEnabled) return;
      const enabledCams = ctx.db.query(
        `SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY CASE WHEN last_status = 'online' THEN 0 ELSE 1 END, id ASC`
      );
      if (enabledCams.length === 0) return;
      const nowMs = Date.now();
      const candidates = enabledCams.filter((c) => {
        const pollIntervalMs = Math.max(8, c.high_freq_poll_sec || 8) * 1e3;
        const lastPoll = lastHighFreqPollAtMsMap.get(c.id) || 0;
        if (c.last_status !== "online" && !activeStreamWorkers.has(c.id)) {
          return nowMs - lastPoll >= 12e4;
        }
        return nowMs - lastPoll >= pollIntervalMs;
      });
      if (candidates.length === 0) return;
      const targetCam = candidates[highFreqRobinIdx % candidates.length];
      highFreqRobinIdx++;
      lastHighFreqPollAtMsMap.set(targetCam.id, nowMs);
      highFreqLoopRunning = true;
      void sampleSingleCamera(targetCam.id, ctx, { backgroundHighFreq: true }).finally(() => {
        highFreqLoopRunning = false;
      });
    }, 8e3);
  }
  ctx.scheduleJob({
    id: "cyclic_camera_sampler",
    name: "Zyklische Kamera-Abtastung (Motion-Gated COCO-SSD)",
    intervalMinutes: 3,
    handler: async () => {
      const cfg = getConfig();
      if (!cfg.cyclicEnabled) return;
      const enabledCams = ctx.db.query(
        "SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY id ASC"
      );
      for (const cam of enabledCams) {
        await sampleSingleCamera(cam.id, ctx, { backgroundHighFreq: true });
      }
      await updateSharedSummaryAndHaSensors(ctx);
    }
  });
  function triggerBackgroundFrameRefresh(cam, appCtx, runAiIfMotion = false) {
    const existingPromise = inFlightFrameRequests.get(cam.id);
    if (existingPromise) return existingPromise;
    const task = (async () => {
      const cfg = getConfig();
      const startMs = Date.now();
      const snap = await acquireCameraSnapshot(cam, cfg);
      const captureMs = Date.now() - startMs;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const nowMs = Date.now();
      const cached = liveFrameCache.get(cam.id);
      if (!snap.ok || !snap.buffer) {
        const errMsg = snap.error || "Kein Live-Frame verf\xFCgbar";
        appCtx.db.execute(
          `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'offline', last_error = ? WHERE id = ?`,
          [nowIso, errMsg, cam.id]
        );
        return {
          ok: false,
          cameraId: cam.id,
          cameraName: cam.name,
          error: errMsg,
          captureMs,
          fallbackFrameB64: cached?.b64 || "",
          metrics: cached?.metrics || null,
          serverDetections: latestDetectionBoxesCache.get(cam.id) || null
        };
      }
      const mimeType = snap.mimeType || "image/jpeg";
      const frameSeq = (rawStreamBufferCache.get(cam.id)?.frameSeq || cached?.frameSeq || 0) + 1;
      rawStreamBufferCache.set(cam.id, {
        buffer: snap.buffer,
        mimeType,
        method: snap.method || "live",
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq
      });
      const decoded = decodeImageBuffer(snap.buffer, mimeType);
      const { width, height, rgba, decodeMs } = decoded;
      const metrics = analyzePixelMetricsAndMotion(
        cam.id,
        width,
        height,
        rgba,
        liveLumaGrids,
        cam.pixel_diff_threshold ?? 15,
        decodeMs
      );
      const b64 = snap.buffer.toString("base64");
      liveFrameCache.set(cam.id, {
        buffer: snap.buffer,
        b64,
        mimeType,
        width,
        height,
        metrics,
        method: snap.method || "live",
        capturedAt: nowIso,
        capturedAtMs: nowMs,
        captureMs,
        frameSeq
      });
      if (runAiIfMotion || metrics.motionPct >= (cam.motion_threshold_pct ?? 0.8) || !latestDetectionBoxesCache.has(cam.id)) {
        void (async () => {
          if (inFlightDetectRequests.has(cam.id)) return;
          const p = (async () => {
            const mode = OPTIMIZATION_MODES.includes(
              cam.optimization_mode
            ) ? cam.optimization_mode : "Objekte";
            const det = await runLocalCocoSsdPipeline(cam.id, snap.buffer, mimeType, mode, {
              minConfidence: cam.min_confidence ?? 0.25,
              motionGateEnabled: Boolean(cam.motion_gate_enabled ?? 1),
              motionThresholdPct: cam.motion_threshold_pct ?? 0.8,
              pixelDiffThreshold: cam.pixel_diff_threshold ?? 15,
              aiInputWidth: cam.ai_input_width ?? 300,
              targetClassesJson: cam.target_classes,
              preDecoded: decoded,
              cachedDetection: latestDetectionBoxesCache.get(cam.id) || null,
              lastAiRunAtMs: lastAiRunAtMsMap.get(cam.id),
              lastPositiveObjectAtMs: lastPositiveObjectAtMsMap.get(cam.id),
              heartbeatIntervalSec: cam.sample_interval_sec || 180
            });
            if (!det.motionGateSkipped) {
              lastAiRunAtMsMap.set(cam.id, Date.now());
              if (det.totalObjects > 0) {
                lastPositiveObjectAtMsMap.set(cam.id, Date.now());
              }
            }
            latestDetectionBoxesCache.set(cam.id, {
              bboxes: det.bboxes || [],
              objects: det.objects || [],
              sceneSummary: det.sceneSummary,
              personCount: det.personCount,
              vehicleCount: det.vehicleCount,
              totalObjects: det.totalObjects,
              processingMs: det.inferenceMs || 0,
              updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
              motionGateSkipped: det.motionGateSkipped
            });
            if (det.totalObjects > 0 || det.motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
              await evaluateAndFireVisionTriggers(
                cam,
                det.bboxes || [],
                det.motionPct,
                det.sceneSummary,
                appCtx
              );
            }
          })();
          inFlightDetectRequests.set(cam.id, p);
          try {
            await p;
          } finally {
            inFlightDetectRequests.delete(cam.id);
          }
        })();
      }
      appCtx.db.execute(
        `UPDATE camera_sources SET last_sampled_at = ?, last_status = 'online', last_error = '' WHERE id = ?`,
        [nowIso, cam.id]
      );
      return {
        ok: true,
        cameraId: cam.id,
        cameraName: cam.name,
        room: cam.room,
        optimizationMode: cam.optimization_mode || "Personen",
        capturedAt: nowIso,
        captureMs,
        frameSeq,
        method: snap.method || "live",
        width,
        height,
        mimeType,
        frameB64: b64,
        metrics,
        serverDetections: latestDetectionBoxesCache.get(cam.id) || null
      };
    })();
    inFlightFrameRequests.set(cam.id, task);
    task.finally(() => {
      inFlightFrameRequests.delete(cam.id);
    });
    return task;
  }
  ctx.route("GET", "/frame.jpg", async (req, appCtx) => {
    const camId = String(req.query.camera_id || "").trim();
    if (!camId) {
      return { status: 400, body: { error: "camera_id ist erforderlich" } };
    }
    const cam = appCtx.db.queryOne(
      "SELECT * FROM camera_sources WHERE id = ?",
      [camId]
    );
    if (!cam) {
      return { status: 404, body: { error: `Kamera ${camId} nicht gefunden` } };
    }
    ensureLiveStreamWorker(cam);
    const rawCached = rawStreamBufferCache.get(camId);
    const decodedCached = liveFrameCache.get(camId);
    if (!rawCached || Date.now() - rawCached.capturedAtMs > 260) {
      const refreshTask = triggerBackgroundFrameRefresh(cam, appCtx, true);
      if (!rawCached && !decodedCached) {
        await refreshTask;
      }
    }
    const latestBuf = rawStreamBufferCache.get(camId)?.buffer || decodedCached?.buffer;
    const latestMime = rawStreamBufferCache.get(camId)?.mimeType || decodedCached?.mimeType || "image/jpeg";
    if (!latestBuf) {
      return { status: 503, body: { error: "Kein Live-Frame verf\xFCgbar" } };
    }
    return {
      status: 200,
      headers: {
        "Content-Type": latestMime,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Frame-Seq": String(rawStreamBufferCache.get(camId)?.frameSeq || 1)
      },
      body: latestBuf
    };
  });
  ctx.route("GET", "/live-frame", async (req, appCtx) => {
    const camId = String(req.query.camera_id || "").trim();
    if (!camId) {
      return { status: 400, body: { ok: false, error: "camera_id ist erforderlich" } };
    }
    const cam = appCtx.db.queryOne(
      "SELECT * FROM camera_sources WHERE id = ?",
      [camId]
    );
    if (!cam) {
      return { status: 404, body: { ok: false, error: `Kamera ${camId} nicht gefunden` } };
    }
    ensureLiveStreamWorker(cam);
    const cached = liveFrameCache.get(camId);
    const telemetryOnly = req.query.telemetry_only === "1";
    const force = req.query.force === "1";
    if (!cached || Date.now() - cached.capturedAtMs > 320 || force && (!cached || Date.now() - cached.capturedAtMs > 180)) {
      const refreshPromise = triggerBackgroundFrameRefresh(cam, appCtx, true);
      if (!cached) {
        const res = await refreshPromise;
        if (telemetryOnly && res && typeof res === "object") {
          return { ...res, frameB64: void 0 };
        }
        return res;
      }
    }
    const rawLatest = rawStreamBufferCache.get(camId);
    return {
      ok: true,
      cameraId: cam.id,
      cameraName: cam.name,
      room: cam.room,
      optimizationMode: cam.optimization_mode || "Personen",
      capturedAt: rawLatest?.capturedAt || cached.capturedAt,
      captureMs: rawLatest?.captureMs || cached.captureMs,
      frameSeq: rawLatest?.frameSeq || cached.frameSeq || 1,
      method: rawLatest?.method || cached.method,
      width: cached.width,
      height: cached.height,
      mimeType: cached.mimeType,
      frameB64: telemetryOnly ? void 0 : cached.b64,
      metrics: cached.metrics,
      serverDetections: latestDetectionBoxesCache.get(cam.id) || null
    };
  });
  ctx.route("GET", "/performance", async () => {
    return perfTracker.getSnapshot(activeStreamWorkers);
  });
  ctx.route("GET", "/triggers", async (_req, appCtx) => {
    const triggers = appCtx.db.query(
      "SELECT * FROM vision_triggers ORDER BY enabled DESC, id DESC"
    );
    const triggerLogs = appCtx.db.query(
      "SELECT * FROM vision_trigger_logs ORDER BY id DESC LIMIT 40"
    );
    const availableAxons = appCtx.actions.listActions().map((a) => ({
      id: a.id,
      name: a.name,
      domainCode: a.domainCode,
      category: a.category,
      description: a.description,
      defaultInput: a.defaultInput
    }));
    return {
      triggers,
      triggerLogs,
      availableAxons,
      objectClasses: Object.entries(GERMAN_LABELS).map(([rawClass, label]) => ({
        rawClass,
        label
      }))
    };
  });
  ctx.route("POST", "/triggers", async (req, appCtx) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    if (!name) {
      return { status: 400, body: { error: "Trigger-Name ist erforderlich" } };
    }
    const cameraId = String(body.camera_id || "*").trim() || "*";
    const objectClass = String(body.object_class || "person").trim();
    const minConfPct = Math.max(10, Math.min(99, Number(body.min_confidence_pct) || 60));
    const minCount = Math.max(1, Math.min(20, Number(body.min_count) || 1));
    const minMotionPct = Math.max(0, Math.min(50, Number(body.min_motion_pct) || 0));
    const timeWindow = String(body.time_window || "always").trim() || "always";
    const cooldownSec = Math.max(5, Math.min(86400, Number(body.cooldown_sec) || 60));
    const actionType = ["axon", "ha_service", "ha_event", "orchestrator_event"].includes(
      String(body.action_type)
    ) ? body.action_type : "axon";
    const actionTarget = String(body.action_target || "ha.call_service").trim();
    const actionPayloadJson = typeof body.action_payload_json === "string" ? body.action_payload_json.trim() || "{}" : JSON.stringify(body.action_payload_json || {});
    const enabled = body.enabled !== void 0 ? body.enabled ? 1 : 0 : 1;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (body.id) {
      appCtx.db.execute(
        `UPDATE vision_triggers
         SET name = ?, enabled = ?, camera_id = ?, object_class = ?, min_confidence_pct = ?, min_count = ?, min_motion_pct = ?, time_window = ?, cooldown_sec = ?, action_type = ?, action_target = ?, action_payload_json = ?
         WHERE id = ?`,
        [
          name,
          enabled,
          cameraId,
          objectClass,
          minConfPct,
          minCount,
          minMotionPct,
          timeWindow,
          cooldownSec,
          actionType,
          actionTarget,
          actionPayloadJson,
          body.id
        ]
      );
      const rowId = Number(info.lastInsertRowid) || 0;
      if (rowId > 35 && rowId % 5 === 0) {
        try {
          appCtx.db.execute(`DELETE FROM vision_detections WHERE id <= ?`, [rowId - 120]);
          appCtx.db.execute(
            `UPDATE vision_detections SET snapshot_b64 = '' WHERE id <= ? AND snapshot_b64 != ''`,
            [rowId - 30]
          );
        } catch {
        }
      }
      await updateSharedSummaryAndHaSensors(appCtx);
      return { saved: true, id: body.id };
    }
    const info = appCtx.db.execute(
      `INSERT INTO vision_triggers
       (name, enabled, camera_id, object_class, min_confidence_pct, min_count, min_motion_pct, time_window, cooldown_sec, action_type, action_target, action_payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        enabled,
        cameraId,
        objectClass,
        minConfPct,
        minCount,
        minMotionPct,
        timeWindow,
        cooldownSec,
        actionType,
        actionTarget,
        actionPayloadJson,
        nowIso
      ]
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return { saved: true, id: info.lastInsertRowid };
  });
  ctx.route("POST", "/triggers/toggle", async (req, appCtx) => {
    const body = req.body || {};
    if (!body.id) {
      return { status: 400, body: { error: "id ist erforderlich" } };
    }
    const enabled = body.enabled ? 1 : 0;
    appCtx.db.execute("UPDATE vision_triggers SET enabled = ? WHERE id = ?", [enabled, body.id]);
    await updateSharedSummaryAndHaSensors(appCtx);
    return { ok: true, id: body.id, enabled };
  });
  ctx.route("DELETE", "/triggers", async (req, appCtx) => {
    const id = Number(req.query.id);
    if (!id) {
      return { status: 400, body: { error: "id ist erforderlich" } };
    }
    appCtx.db.execute("DELETE FROM vision_triggers WHERE id = ?", [id]);
    await updateSharedSummaryAndHaSensors(appCtx);
    return { deleted: id };
  });
  ctx.route("POST", "/triggers/test", async (req, appCtx) => {
    const body = req.body || {};
    if (!body.id) {
      return { status: 400, body: { error: "id ist erforderlich" } };
    }
    const trig = appCtx.db.queryOne(
      "SELECT * FROM vision_triggers WHERE id = ?",
      [body.id]
    );
    if (!trig) {
      return { status: 404, body: { error: `Trigger #${body.id} nicht gefunden` } };
    }
    const cam = appCtx.db.queryOne(
      "SELECT * FROM camera_sources WHERE id = ?",
      [trig.camera_id === "*" ? "camera.cam_eg_vz_eingang" : trig.camera_id]
    ) || appCtx.db.queryOne("SELECT * FROM camera_sources LIMIT 1");
    if (!cam) {
      return { status: 404, body: { error: "Keine Kamera f\xFCr Testlauf gefunden" } };
    }
    const res = await executeSingleTriggerAction(
      trig,
      cam,
      {
        matchedClass: trig.object_class,
        matchedLabel: GERMAN_LABELS[trig.object_class] || trig.object_class,
        confidencePct: Math.max(trig.min_confidence_pct, 82),
        count: Math.max(1, trig.min_count),
        motionPct: Math.max(1.8, trig.min_motion_pct || 1.8),
        sceneSummary: `Manueller Testlauf f\xFCr Regel \u201E${trig.name}\u201C`
      },
      appCtx,
      true
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return res;
  });
  ctx.route("POST", "/detect-live", async (req, appCtx) => {
    const body = req.body || {};
    const camId = String(body.camera_id || "").trim();
    if (!camId) {
      return { status: 400, body: { ok: false, error: "camera_id ist erforderlich" } };
    }
    const cam = appCtx.db.queryOne(
      "SELECT * FROM camera_sources WHERE id = ?",
      [camId]
    );
    if (!cam) {
      return { status: 404, body: { ok: false, error: `Kamera ${camId} nicht gefunden` } };
    }
    const mode = body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode) ? body.optimization_mode : cam.optimization_mode || "Objekte";
    if (Array.isArray(body.client_bboxes)) {
      const bboxes = body.client_bboxes.map((b) => ({
        ...b,
        label: GERMAN_LABELS[b.rawClass] || b.label || b.rawClass
      }));
      const grouped = /* @__PURE__ */ new Map();
      for (const b of bboxes) {
        const ex = grouped.get(b.rawClass);
        if (ex) {
          ex.count += 1;
          ex.confidence = Math.max(ex.confidence, b.confidence);
          ex.bboxes.push(b);
        } else {
          grouped.set(b.rawClass, {
            label: b.label,
            rawClass: b.rawClass,
            confidence: b.confidence,
            count: 1,
            bboxes: [b]
          });
        }
      }
      const objects = Array.from(grouped.values());
      const personCount = bboxes.filter((b) => b.rawClass === "person").length;
      const vehicleCount = bboxes.filter((b) => VEHICLE_CLASSES.has(b.rawClass)).length;
      const totalObjects = bboxes.length;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const cachedFrame = liveFrameCache.get(camId);
      const motionPct = cachedFrame?.metrics.motionPct ?? 0;
      const sceneSummary = totalObjects > 0 ? `${totalObjects} ${totalObjects === 1 ? "Objekt" : "Objekte"} im Live-Stream: ${objects.map((o) => `${o.count}\xD7 ${o.label} (${Math.round(o.confidence * 100)}%)`).join(", ")}` : `Keine Zielobjekte im Live-Stream (${cachedFrame?.metrics.lightingMode || "Bereit"})`;
      const entry = {
        bboxes,
        objects,
        sceneSummary,
        personCount,
        vehicleCount,
        totalObjects,
        processingMs: 28,
        updatedAt: nowIso
      };
      latestDetectionBoxesCache.set(camId, entry);
      if (totalObjects > 0 || motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
        await evaluateAndFireVisionTriggers(cam, bboxes, motionPct, sceneSummary, appCtx);
      }
      if (body.save_to_log && cachedFrame) {
        appCtx.db.execute(
          `INSERT INTO vision_detections
           (camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64)
           VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cam.id,
            cam.name,
            mode,
            nowIso,
            JSON.stringify(objects),
            JSON.stringify(cachedFrame.metrics),
            totalObjects,
            personCount,
            vehicleCount,
            motionPct,
            sceneSummary,
            `WebGL Live COCO-SSD (${mode})`,
            28,
            cachedFrame.b64.length <= 48e4 ? cachedFrame.b64 : ""
          ]
        );
        await updateSharedSummaryAndHaSensors(appCtx);
      }
      return { ok: true, ...entry };
    }
    const existingDetect = inFlightDetectRequests.get(camId);
    if (existingDetect) {
      return await existingDetect;
    }
    const detectTask = (async () => {
      let frameBuf = rawStreamBufferCache.get(camId)?.buffer || liveFrameCache.get(camId)?.buffer;
      let frameMime = rawStreamBufferCache.get(camId)?.mimeType || liveFrameCache.get(camId)?.mimeType || "image/jpeg";
      if (!frameBuf) {
        const snap = await acquireCameraSnapshot(cam, getConfig());
        if (!snap.ok || !snap.buffer) {
          return { ok: false, error: snap.error || "Kein Kamerabild verf\xFCgbar" };
        }
        frameBuf = snap.buffer;
        frameMime = snap.mimeType || "image/jpeg";
      }
      const startMs = Date.now();
      const det = await runLocalCocoSsdPipeline(cam.id, frameBuf, frameMime, mode, {
        minConfidence: cam.min_confidence ?? 0.25,
        motionGateEnabled: Boolean(cam.motion_gate_enabled ?? 1),
        motionThresholdPct: cam.motion_threshold_pct ?? 0.8,
        pixelDiffThreshold: cam.pixel_diff_threshold ?? 15,
        aiInputWidth: cam.ai_input_width ?? 300,
        targetClassesJson: cam.target_classes,
        forceAi: body.force_ai ?? Boolean(body.save_to_log),
        cachedDetection: latestDetectionBoxesCache.get(cam.id) || null,
        lastAiRunAtMs: lastAiRunAtMsMap.get(cam.id),
        lastPositiveObjectAtMs: lastPositiveObjectAtMsMap.get(cam.id),
        heartbeatIntervalSec: cam.sample_interval_sec || 180
      });
      const processingMs = Date.now() - startMs;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (!det.motionGateSkipped) {
        lastAiRunAtMsMap.set(cam.id, Date.now());
        if (det.totalObjects > 0) {
          lastPositiveObjectAtMsMap.set(cam.id, Date.now());
        }
      }
      const entry = {
        bboxes: det.bboxes || [],
        objects: det.objects || [],
        sceneSummary: det.sceneSummary,
        personCount: det.personCount,
        vehicleCount: det.vehicleCount,
        totalObjects: det.totalObjects,
        processingMs,
        updatedAt: nowIso,
        motionGateSkipped: det.motionGateSkipped
      };
      latestDetectionBoxesCache.set(camId, entry);
      if (det.totalObjects > 0 || det.motionPct >= (cam.motion_threshold_pct ?? 0.8)) {
        await evaluateAndFireVisionTriggers(
          cam,
          det.bboxes || [],
          det.motionPct,
          det.sceneSummary,
          appCtx
        );
      }
      if (body.save_to_log) {
        const b64 = frameBuf.byteLength <= 35e4 ? frameBuf.toString("base64") : "";
        appCtx.db.execute(
          `INSERT INTO vision_detections
           (camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64)
           VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cam.id,
            cam.name,
            mode,
            nowIso,
            JSON.stringify(det.objects),
            JSON.stringify(det.metrics),
            det.totalObjects,
            det.personCount,
            det.vehicleCount,
            det.motionPct,
            det.sceneSummary,
            det.engineUsed,
            processingMs,
            b64
          ]
        );
        await updateSharedSummaryAndHaSensors(appCtx);
      }
      return {
        ok: true,
        ...entry,
        metrics: det.metrics
      };
    })();
    inFlightDetectRequests.set(camId, detectTask);
    try {
      return await detectTask;
    } finally {
      inFlightDetectRequests.delete(camId);
    }
  });
  let haStatesCache = {
    fetchedAtMs: 0,
    states: []
  };
  let go2rtcStatusCache = {
    checkedAtMs: 0,
    online: false,
    streams: {}
  };
  let go2rtcRefreshInFlight = false;
  ctx.route("GET", "/dashboard", async (req, appCtx) => {
    const cfg = getConfig();
    const includeLogSnapshots = req.query.include_snapshots === "1";
    const cameras = appCtx.db.query(
      "SELECT * FROM camera_sources ORDER BY enabled DESC, name ASC"
    );
    const nowMs = Date.now();
    if (nowMs - haStatesCache.fetchedAtMs > 15e3) {
      if (haStatesCache.states.length === 0) {
        const fresh = await Promise.race([
          appCtx.ha.getStates("camera").catch(() => []),
          new Promise((resolve) => setTimeout(() => resolve([]), 450))
        ]);
        haStatesCache = { fetchedAtMs: Date.now(), states: fresh };
      } else {
        haStatesCache.fetchedAtMs = nowMs;
        void appCtx.ha.getStates("camera").then((fresh) => {
          haStatesCache = { fetchedAtMs: Date.now(), states: fresh };
        }).catch(() => {
        });
      }
    }
    const stateMap = new Map(haStatesCache.states.map((s) => [s.entity_id, s]));
    const detections = includeLogSnapshots ? appCtx.db.query(
      `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64
           FROM vision_detections ORDER BY id DESC LIMIT 25`
    ) : appCtx.db.query(
      `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, '' as snapshot_b64
           FROM vision_detections ORDER BY id DESC LIMIT 25`
    );
    const latestByCam = /* @__PURE__ */ new Map();
    for (const c of cameras) {
      if (!liveFrameCache.has(c.id)) {
        const row = appCtx.db.queryOne(
          `SELECT id, camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64
           FROM vision_detections
           WHERE camera_id = ?
           ORDER BY id DESC LIMIT 1`,
          [c.id]
        );
        if (row) latestByCam.set(c.id, row);
      }
    }
    const enrichedCameras = cameras.map((c) => {
      const haState = stateMap.get(c.id);
      let lan6668 = false;
      let lan554 = false;
      if (c.lan_ip) {
        const cachedLan = lanStatusCache.get(c.lan_ip);
        if (cachedLan) {
          lan6668 = cachedLan.port6668;
          lan554 = cachedLan.port554;
        }
        if (!cachedLan || nowMs - cachedLan.checkedAtMs >= 6e4) {
          lanStatusCache.set(c.lan_ip, {
            checkedAtMs: nowMs,
            port6668: lan6668,
            port554: lan554
          });
          void Promise.all([
            checkTcpPort(c.lan_ip, 6668, 250),
            checkTcpPort(c.lan_ip, 554, 250)
          ]).then(([p6668, p554]) => {
            lanStatusCache.set(c.lan_ip, {
              checkedAtMs: Date.now(),
              port6668: p6668,
              port554: p554
            });
          });
        }
      }
      const liveMem = liveFrameCache.get(c.id);
      const latestRow = latestByCam.get(c.id);
      const latestDetMem = latestDetectionBoxesCache.get(c.id);
      let parsedObjects = [];
      let parsedMetrics = {};
      if (latestRow) {
        try {
          parsedObjects = JSON.parse(latestRow.objects_json || "[]");
        } catch {
        }
        try {
          parsedMetrics = JSON.parse(latestRow.metrics_json || "{}");
        } catch {
        }
      }
      const flattenedBboxes = latestDetMem?.bboxes || parsedObjects.flatMap((o) => Array.isArray(o.bboxes) ? o.bboxes : []);
      return {
        ...c,
        min_confidence: c.min_confidence ?? 0.45,
        motion_gate_enabled: c.motion_gate_enabled ?? 1,
        motion_threshold_pct: c.motion_threshold_pct ?? 2.2,
        pixel_diff_threshold: c.pixel_diff_threshold ?? 25,
        ai_input_width: c.ai_input_width ?? 640,
        log_cooldown_sec: c.log_cooldown_sec ?? 30,
        high_freq_poll_sec: c.high_freq_poll_sec ?? 3,
        optimization_mode: c.optimization_mode || "Personen",
        ha_state: haState?.state || "missing_in_ha",
        ha_attributes: haState?.attributes || {},
        lan_reachable_6668: lan6668,
        lan_reachable_554: lan554,
        latest_snapshot_b64: liveMem?.b64 || latestRow?.snapshot_b64 || "",
        latest_scene_summary: latestDetMem?.sceneSummary || latestRow?.scene_summary || "",
        latest_sampled_at: liveMem?.capturedAt || latestRow?.sampled_at || c.last_sampled_at || "",
        latest_objects: latestDetMem?.objects || parsedObjects,
        latest_metrics: liveMem?.metrics || parsedMetrics,
        latest_bboxes: flattenedBboxes
      };
    });
    if (!go2rtcRefreshInFlight && nowMs - go2rtcStatusCache.checkedAtMs > 2e4) {
      go2rtcRefreshInFlight = true;
      go2rtcStatusCache.checkedAtMs = nowMs;
      void fetch(`${cfg.go2rtcUrl.replace(/\/+$/, "")}/api/streams`, {
        signal: AbortSignal.timeout(800)
      }).then(async (gr) => {
        if (gr.ok) {
          const streams = await gr.json();
          go2rtcStatusCache = { checkedAtMs: Date.now(), online: true, streams };
        } else {
          go2rtcStatusCache = { checkedAtMs: Date.now(), online: false, streams: {} };
        }
      }).catch(() => {
        go2rtcStatusCache = { checkedAtMs: Date.now(), online: false, streams: {} };
      }).finally(() => {
        go2rtcRefreshInFlight = false;
      });
    }
    const triggers = appCtx.db.query(
      "SELECT * FROM vision_triggers ORDER BY enabled DESC, id DESC"
    );
    const triggerLogs = appCtx.db.query(
      "SELECT * FROM vision_trigger_logs ORDER BY id DESC LIMIT 25"
    );
    return {
      config: cfg,
      optimizationModes: OPTIMIZATION_MODES,
      go2rtc: {
        online: go2rtcStatusCache.online,
        url: cfg.go2rtcUrl,
        streams: go2rtcStatusCache.streams
      },
      performance: perfTracker.getSnapshot(activeStreamWorkers),
      triggers,
      triggerLogs,
      cameras: enrichedCameras,
      detections: detections.map((d) => ({
        ...d,
        snapshot_b64: includeLogSnapshots ? d.snapshot_b64 : "",
        objects: (() => {
          try {
            return JSON.parse(d.objects_json);
          } catch {
            return [];
          }
        })(),
        metrics: (() => {
          try {
            return JSON.parse(d.metrics_json || "{}");
          } catch {
            return {};
          }
        })()
      }))
    };
  });
  ctx.route("POST", "/camera-mode", async (req, appCtx) => {
    const body = req.body || {};
    if (!body.camera_id) {
      return { status: 400, body: { error: "camera_id ist erforderlich" } };
    }
    const cam = appCtx.db.queryOne(
      "SELECT * FROM camera_sources WHERE id = ?",
      [body.camera_id]
    );
    if (!cam) {
      return { status: 404, body: { error: `Kamera ${body.camera_id} nicht gefunden` } };
    }
    const nextMode = body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode) ? body.optimization_mode : cam.optimization_mode;
    const nextConf = body.min_confidence !== void 0 ? Math.max(0.1, Math.min(0.95, Number(body.min_confidence))) : cam.min_confidence ?? 0.25;
    const nextGate = body.motion_gate_enabled !== void 0 ? body.motion_gate_enabled ? 1 : 0 : cam.motion_gate_enabled ?? 1;
    const nextMotionThresh = body.motion_threshold_pct !== void 0 ? Math.max(0.1, Math.min(25, Number(body.motion_threshold_pct))) : cam.motion_threshold_pct ?? 0.8;
    appCtx.db.execute(
      `UPDATE camera_sources
       SET optimization_mode = ?, min_confidence = ?, motion_gate_enabled = ?, motion_threshold_pct = ?
       WHERE id = ?`,
      [nextMode, nextConf, nextGate, nextMotionThresh, body.camera_id]
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return {
      ok: true,
      camera_id: body.camera_id,
      optimization_mode: nextMode,
      min_confidence: nextConf,
      motion_gate_enabled: nextGate,
      motion_threshold_pct: nextMotionThresh
    };
  });
  ctx.route("POST", "/sample-now", async (req, appCtx) => {
    const body = req.body || {};
    if (body.camera_id) {
      const res = await sampleSingleCamera(body.camera_id, appCtx, {
        forceAi: body.force_ai ?? true,
        backgroundHighFreq: false
      });
      return { results: [res] };
    }
    const enabled = appCtx.db.query(
      "SELECT * FROM camera_sources WHERE enabled = 1 ORDER BY id ASC"
    );
    const results = [];
    for (const c of enabled) {
      results.push(
        await sampleSingleCamera(c.id, appCtx, {
          forceAi: body.force_ai ?? false,
          backgroundHighFreq: false
        })
      );
    }
    return { results };
  });
  ctx.route("POST", "/analyze-image", async (req, appCtx) => {
    const body = req.body || {};
    if (!body.image_base64) {
      return { status: 400, body: { error: "image_base64 ist erforderlich" } };
    }
    const cleanB64 = body.image_base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const buf = Buffer.from(cleanB64, "base64");
    const mode = body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode) ? body.optimization_mode : "Objekte";
    const startMs = Date.now();
    const camId = body.camera_id || "manual.upload";
    const camName = body.camera_name || "Manueller Snapshot-Test";
    const det = await runLocalCocoSsdPipeline(
      camId,
      buf,
      body.mime_type || "image/jpeg",
      mode,
      {
        minConfidence: body.min_confidence ?? 0.22,
        forceAi: true
      }
    );
    const elapsed = Date.now() - startMs;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const info = appCtx.db.execute(
      `INSERT INTO vision_detections
       (camera_id, camera_name, optimization_mode, sampled_at, status, objects_json, metrics_json, total_objects, person_count, vehicle_count, motion_pct, scene_summary, engine_used, processing_ms, snapshot_b64)
       VALUES (?, ?, ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        camId,
        camName,
        mode,
        nowIso,
        JSON.stringify(det.objects),
        JSON.stringify(det.metrics),
        det.totalObjects,
        det.personCount,
        det.vehicleCount,
        det.motionPct,
        det.sceneSummary,
        det.engineUsed,
        elapsed,
        buf.byteLength <= 35e4 ? cleanB64 : ""
      ]
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return {
      detectionId: info.lastInsertRowid,
      ...det,
      optimizationMode: mode,
      processingMs: elapsed,
      sampledAt: nowIso
    };
  });
  ctx.route("POST", "/cameras", async (req, appCtx) => {
    const body = req.body || {};
    if (!body.id || !body.name) {
      return { status: 400, body: { error: "id und name sind erforderlich" } };
    }
    const mode = body.optimization_mode && OPTIMIZATION_MODES.includes(body.optimization_mode) ? body.optimization_mode : "Personen";
    const minConf = Math.max(0.1, Math.min(0.95, Number(body.min_confidence) || 0.45));
    const motionGate = body.motion_gate_enabled !== void 0 ? body.motion_gate_enabled ? 1 : 0 : 1;
    const motionThresh = Math.max(0.1, Math.min(25, Number(body.motion_threshold_pct) || 2.2));
    const pixelDiff = Math.max(4, Math.min(80, Number(body.pixel_diff_threshold) || 25));
    const aiWidth = [224, 300, 416, 640, 800].includes(Number(body.ai_input_width)) ? Number(body.ai_input_width) : 640;
    const logCooldown = Math.max(5, Math.min(3600, Number(body.log_cooldown_sec) || 30));
    const highFreqSec = Math.max(1, Math.min(120, Number(body.high_freq_poll_sec) || 3));
    appCtx.db.execute(
      `INSERT INTO camera_sources
       (id, name, room, source_type, stream_url, lan_ip, enabled, sample_interval_sec, optimization_mode, target_classes, last_sampled_at, last_status, last_error, min_confidence, motion_gate_enabled, motion_threshold_pct, pixel_diff_threshold, ai_input_width, log_cooldown_sec, high_freq_poll_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'unprobed', '', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         room = excluded.room,
         source_type = excluded.source_type,
         stream_url = excluded.stream_url,
         lan_ip = excluded.lan_ip,
         enabled = excluded.enabled,
         sample_interval_sec = excluded.sample_interval_sec,
         optimization_mode = excluded.optimization_mode,
         target_classes = excluded.target_classes,
         min_confidence = excluded.min_confidence,
         motion_gate_enabled = excluded.motion_gate_enabled,
         motion_threshold_pct = excluded.motion_threshold_pct,
         pixel_diff_threshold = excluded.pixel_diff_threshold,
         ai_input_width = excluded.ai_input_width,
         log_cooldown_sec = excluded.log_cooldown_sec,
         high_freq_poll_sec = excluded.high_freq_poll_sec`,
      [
        body.id.trim(),
        body.name.trim(),
        (body.room || "Allgemein").trim(),
        body.source_type || "ha_entity",
        (body.stream_url || "").trim(),
        (body.lan_ip || "").trim(),
        body.enabled ?? 1,
        Number(body.sample_interval_sec) || 180,
        mode,
        body.target_classes || '["person","car"]',
        minConf,
        motionGate,
        motionThresh,
        pixelDiff,
        aiWidth,
        logCooldown,
        highFreqSec
      ]
    );
    await updateSharedSummaryAndHaSensors(appCtx);
    return { saved: true };
  });
  ctx.route("POST", "/config", async (req, appCtx) => {
    const current = getConfig();
    const body = req.body || {};
    const updated = {
      ...current,
      ...body
    };
    appCtx.db.kvSet("vision_config", updated);
    return { saved: true, config: updated };
  });
  async function fetchActiveTuyaFlow(haUrl, haToken) {
    let storedUserCode = "";
    let storedEntryTitle = "";
    let storedEntryId = "01KCMYXWZ67QCM7YXY37ZTKBDZ";
    const storagePath = "/homeassistant/.storage/core.config_entries";
    try {
      if (fs3.existsSync(storagePath)) {
        const raw = JSON.parse(fs3.readFileSync(storagePath, "utf-8"));
        const entries = raw?.data?.entries || [];
        const tuyaEntry = entries.find((e) => e.domain === "tuya");
        if (tuyaEntry) {
          storedUserCode = tuyaEntry.data?.user_code || "";
          storedEntryTitle = tuyaEntry.title || "";
          storedEntryId = tuyaEntry.entry_id || storedEntryId;
        }
      }
    } catch {
    }
    const flows = await new Promise(
      (resolve) => {
        try {
          const ws = new WebSocket(haUrl.replace(/^http/, "ws") + "/api/websocket");
          const t = setTimeout(() => {
            try {
              ws.close();
            } catch {
            }
            resolve([]);
          }, 5e3);
          ws.addEventListener("message", (ev) => {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === "auth_required")
              ws.send(JSON.stringify({ type: "auth", access_token: haToken }));
            if (msg.type === "auth_ok")
              ws.send(JSON.stringify({ id: 1, type: "config_entries/flow/progress" }));
            if (msg.id === 1) {
              clearTimeout(t);
              ws.close();
              resolve(msg.result || []);
            }
          });
        } catch {
          resolve([]);
        }
      }
    );
    const tuyaFlow = flows.find((f) => f.handler === "tuya");
    let flowDetails = null;
    let qrData = "";
    if (tuyaFlow) {
      try {
        const r = await fetch(`${haUrl}/api/config/config_entries/flow/${tuyaFlow.flow_id}`, {
          headers: { Authorization: `Bearer ${haToken}` }
        });
        flowDetails = await r.json();
        const schema = flowDetails?.data_schema || [];
        qrData = schema[0]?.selector?.qr_code?.data || "";
      } catch {
      }
    }
    return {
      storedUserCode,
      storedEntryTitle,
      storedEntryId,
      activeFlowId: tuyaFlow?.flow_id || null,
      qrData,
      flowDetails
    };
  }
  ctx.route("GET", "/tuya-reauth", async () => {
    const { haUrl, haToken } = getHaConnection();
    return await fetchActiveTuyaFlow(haUrl, haToken);
  });
  ctx.route("POST", "/tuya-reauth-refresh", async () => {
    const { haUrl, haToken } = getHaConnection();
    const current = await fetchActiveTuyaFlow(haUrl, haToken);
    if (current.activeFlowId) {
      await fetch(`${haUrl}/api/config/config_entries/flow/${current.activeFlowId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${haToken}` }
      }).catch(() => {
      });
    }
    await fetch(`${haUrl}/api/config/config_entries/entry/${current.storedEntryId}/reload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${haToken}` }
    }).catch(() => {
    });
    await new Promise((r) => setTimeout(r, 1400));
    return await fetchActiveTuyaFlow(haUrl, haToken);
  });
  ctx.route("POST", "/tuya-reauth", async (req, appCtx) => {
    const { haUrl, haToken } = getHaConnection();
    const body = req.body || {};
    const flowId = body.flow_id || (await fetchActiveTuyaFlow(haUrl, haToken)).activeFlowId;
    if (!flowId) {
      return {
        status: 400,
        body: { error: "Kein aktiver Tuya-QR-Flow gefunden. Bitte neuen QR-Code generieren." }
      };
    }
    const r = await fetch(`${haUrl}/api/config/config_entries/flow/${flowId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${haToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body.user_code ? { user_code: body.user_code } : {})
    });
    const resData = await r.json();
    if (resData.type === "abort" || resData.type === "create_entry") {
      await new Promise((res) => setTimeout(res, 2500));
      await sampleSingleCamera("camera.lsc_smart_ptz_camera_2", appCtx);
    }
    return { status: r.status, body: resData };
  });
  ctx.route("POST", "/configure-onvif", async (req, appCtx) => {
    const body = req.body || {};
    const camId = body.camera_id || "camera.lsc_smart_ptz_camera_2";
    const ip = (body.lan_ip || "192.168.188.140").trim();
    const user = (body.username || "admin").trim();
    const pass = (body.password || "").trim();
    const rtspPath = (body.rtsp_path || "/onvif1").trim();
    const p554 = await checkTcpPort(ip, 554, 600);
    const p8554 = await checkTcpPort(ip, 8554, 600);
    const port = p554 ? 554 : p8554 ? 8554 : 554;
    const authPart = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : "";
    const rtspUrl = `rtsp://${authPart}${ip}:${port}${rtspPath.startsWith("/") ? rtspPath : "/" + rtspPath}`;
    appCtx.db.execute(
      `UPDATE camera_sources SET lan_ip = ?, stream_url = ?, enabled = 1 WHERE id = ?`,
      [ip, rtspUrl, camId]
    );
    const cfg = getConfig();
    try {
      await fetch(
        `${cfg.go2rtcUrl.replace(/\/+$/, "")}/api/streams?name=${encodeURIComponent(camId)}&src=${encodeURIComponent(rtspUrl)}`,
        { method: "PUT", signal: AbortSignal.timeout(3e3) }
      );
    } catch {
    }
    const sampleRes = await sampleSingleCamera(camId, appCtx);
    return {
      configured: true,
      camera_id: camId,
      rtspUrl,
      port554Open: p554,
      port8554Open: p8554,
      sampleRes
    };
  });
});
export {
  GERMAN_LABELS,
  OPTIMIZATION_MODES,
  index_default as default
};
