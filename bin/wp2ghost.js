#!/usr/bin/env node
var wp2ghost = require('../lib/wp2ghost.js');
var path = require('path');
var fs = require('fs');

var args = process.argv;

if (args.length < 4 || args[0].match(/node[\-\.\d]*$/) === null) {
  console.error("Usage: node " + path.relative(process.cwd(), __filename) + " <wordpress.xml> <ghost.json> [--redirect]")
  console.error("NOTE: The options order matters!");
  process.exit();
}

// args[0] == 'node'
// args[1] == 'bin/wp2ghost.js'
// args[2] == 'wordpress.xml'       // input
// args[3] == 'ghost.json'          // output
var wpXmlInputFile = args[2];
var ghostJsonOutputFile = args[3];

// Sets whether the script will generate a redirects.json file
// and redirect all slugs to /{year}/{month}/{day}/{slug}
// which is usually used on Wordpress and is not the default on Ghost
// and so to enable it, one has to use Ghost's `routes` feature and set a permalink to
// /{year}/{month}/{day}/{slug}/ for / collection
var redirectToYearMonthDaySlug = (args[4] === "--redirect");

if (redirectToYearMonthDaySlug) {
  console.log("Will generate redirects.json file that will redirect urls slugs to /{year}/{month}/{day}/{slug} URLs");
  console.log("NOTE: This requires a custom routes set in Ghost settings to work.");
}
else {
  console.log("Won't generate redirects.json to redirect URLs to /{year}/{month}/{day}/{slug} URLs as --redirect was not passed as [4] argument");
}

var when = wp2ghost.fromFile(wpXmlInputFile);

when.then(function(data) {
  var jsonData = data['ghost.json'];
  var redirectsData = data['redirects.json'];

  // Save <ghost.json>
  fs.writeFile(ghostJsonOutputFile, JSON.stringify(jsonData), function (err) {
    if (err) throw err;
    console.log("Ghost 1.x JSON saved to " + ghostJsonOutputFile);
  });

  // Save "redirects.json" if `--redirect` was passed
  if (redirectToYearMonthDaySlug) {
    fs.writeFile('redirects.json', JSON.stringify(redirectsData, null, 2), function (err) {
    if (err) throw err;
    console.log("Ghost redirects.json generated");
    });
  }

}, function(err) {
  process.stderr.write(JSON.stringify(err));
});
