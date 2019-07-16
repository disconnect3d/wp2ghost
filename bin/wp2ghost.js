#!/usr/bin/env node
var wp2ghost = require('../lib/wp2ghost.js');
var path = require('path');
var fs = require('fs');

var args = process.argv;

if (args.length < 4 || args[0].match(/node[\-\.\d]*$/) === null) {
  console.error("Usage: node " + path.relative(process.cwd(), __filename) + " <wordpress.xml> <ghost.json>")
  process.exit();
}

// args[0] == 'node'
// args[1] == 'bin/wp2ghost.js'
// args[2] == 'wordpress.xml'       // input
// args[3] == 'ghost.json'          // output
var wpXmlInputFile = args[2];
var ghostJsonOutputFile = args[3];

var when = wp2ghost.fromFile(wpXmlInputFile);
when.then(function(data) {
  ghostJson = JSON.stringify(data);
  fs.writeFile(ghostJsonOutputFile, ghostJson, function (err) {
    if (err) throw err;
    console.log("Ghost 1.x JSON saved to " + ghostJsonOutputFile);
  });
}, function(err) {
  process.stderr.write(JSON.stringify(err));
});
