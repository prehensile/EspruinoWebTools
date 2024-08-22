#!/usr/bin/env node

const { Command } = require('commander');
const fontconverter = require("./fontconverter");
const imageconverter = require("./imageconverter");


function transformPng( png, pngjs ){
  
  const rotated = new pngjs({
    width: png.height,
    height: png.width
  });

  // Rotate the image by 90 degrees clockwise & flip vertically
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const oldIdx = (png.width * y + x) << 2;
      const newX = y;
      const newY = x;
      const newIdx = (rotated.width * newY + newX) << 2;

      rotated.data[newIdx] = png.data[oldIdx];     // R
      rotated.data[newIdx + 1] = png.data[oldIdx + 1]; // G
      rotated.data[newIdx + 2] = png.data[oldIdx + 2]; // B
      rotated.data[newIdx + 3] = png.data[oldIdx + 3]; // A
    }
  }

  return( rotated );
}

function variableWidthPngFont( fontInfo ){
  // directly generate font data if we already have widths & a PNG file
  // mostly a separate function here because I can't get my head around fontconverter.js :D
  var pngjs = require("pngjs").PNG;
  var png = pngjs.sync.read(require("fs").readFileSync(fontInfo.fn));
  
  // espruino font bitmaps are rotated & flipped vertically relative to PNG
  if( png.width > png.height ){
    // assume PNG is wide and hasn't been flipped yet
    png = transformPng( png, pngjs );    
  }
  
  var imageString = imageconverter.RGBAtoString( png.data, {
    tranparent: false,
    inverted: true,
    width: png.width,
    height: png.height,
    mode: "1bit",
    output: "object"
  });
  // we're doing this weird regex parsing of the object contained in
  // imageString because it's the only output mode that produces a buffer that
  // converts properly into a font (shrug)
  let rx = new RegExp('buffer : ([^)]+)');
  imageString = imageString.match( rx )[1] + ")";

  let charMin = fontInfo.range[0].min;

  return `Graphics.prototype.setFont${fontInfo.name} = function() {
    return this.setFontCustom(
      ${imageString},
      ${charMin},
      ${`atob("${btoa(String.fromCharCode.apply(null,fontInfo.widths))}")`},
      ${png.width}
    );
  }\n`;
}

const program = new Command();

const fontRanges = {
  "ASCII" : {min:32, max:127, txt:"This is a test of the font"},
  "ASCIICAPS" : {min:32, max:93, txt:"THIS IS A TEST OF THE FONT"},
  "ISO8859-1" : {min:32, max:255, txt:"This is a test of the font"},
  "LatinExt" : {min:32, max:591, txt:"This is a test of the font"},
  "Numeric" : {min:46, max:58, txt:"0.123456789:/"},
 };

program
  .name('espruino-tools')
  .description('CLI to Espruino Web Tools')
  .version('0.0.1');

program.command('fontconverter')
  .description('Convert a font to Espruino format')
  .argument('<file>', 'file to convert')
  .requiredOption('-h, --height <height>', 'actual used height of font map', 0)
  .option('-r, --range <range>', 'Character range', "ASCII" )
  .option('-y, --yoffset <yoffset>', 'Y offset', 0)
  .option('-c, --ycropped <ycropped>', 'Override glyph height to a cropped height (BDF only)')
  .option('-n, --name <name>', 'Font name')
  .option('-d, --debug', 'Display debug information', false)
  .option('--widths <widths>', 'A list of widths to use while generating a variable-width font (PNG only)')
  .action((file,options) => {

    let fontInfo = {
        fn : file,
        height : parseInt(options.height),
        range: fontconverter.getRanges()[options.range].range
    }

    if( options.yoffset ) fontInfo.yOffset = options.yoffset;
    if( options.ycropped ) fontInfo.croppedHeight = options.ycropped;
    if( options.name ) fontInfo.name = options.name;
    if( options.widths ) fontInfo.widths = options.widths.split(",").map(Number);

    let js = "";
    
    if( options.widths && file.endsWith(".png") ){
      // special path for variable-width png fonts
      js = variableWidthPngFont( fontInfo );
    } else {
      // path for everything else 
      const font = fontconverter.load( fontInfo );
      const js = font.getJS();
      if( options.debug ) font.debugChars();
    }
    
    console.log( js );
    //return( js );

  });

program.parse();