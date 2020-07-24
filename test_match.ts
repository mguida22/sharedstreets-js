import * as fs from "fs";

import * as turfHelpers from "@turf/helpers";

import { TilePathParams } from "./src/index";

import { CleanedPoints, CleanedLines } from "./src/geom";
import { Graph } from "./src/index";
import envelope from "@turf/envelope";

import test from "tape";

const BUILD_TEST_OUPUT = false;

test("match points", async (t: any) => {
  // test polygon (dc area)
  const content = fs.readFileSync("test/geojson/points_1.in.geojson");
  var pointsIn: turfHelpers.FeatureCollection<turfHelpers.Point> = JSON.parse(
    content.toLocaleString()
  );
  var cleanedPoints = new CleanedPoints(pointsIn);

  var points: turfHelpers.FeatureCollection<turfHelpers.Point> = turfHelpers.featureCollection(
    cleanedPoints.clean
  );

  var params = new TilePathParams();
  params.source = "osm/planet-180430";
  params.tileHierarchy = 6;

  // test matcher point candidates
  var matcher = new Graph(null, params);

  var matchedPoints: turfHelpers.Feature<turfHelpers.Point>[] = [];
  for (let searchPoint of points.features) {
    let matches = await matcher.matchPoint(searchPoint, null, 3);
    for (let match of matches) {
      matchedPoints.push(match.toFeature());
    }
  }
  const matchedPointFeatureCollection_1a: turfHelpers.FeatureCollection<turfHelpers.Point> = turfHelpers.featureCollection(
    matchedPoints
  );

  const expected_1a_file = "test/geojson/points_1a.out.geojson";
  if (BUILD_TEST_OUPUT) {
    var expected_1a_out: string = JSON.stringify(
      matchedPointFeatureCollection_1a
    );
    fs.writeFileSync(expected_1a_file, expected_1a_out);
  }

  const expected_1a_in = fs.readFileSync(expected_1a_file);
  const expected_1a: turfHelpers.FeatureCollection<turfHelpers.Point> = JSON.parse(
    expected_1a_in.toLocaleString()
  );

  t.deepEqual(expected_1a, matchedPointFeatureCollection_1a);

  matcher.searchRadius = 1000;

  var matchedPoints: turfHelpers.Feature<turfHelpers.Point>[] = [];
  let matches = await matcher.matchPoint(points.features[0], null, 10);

  for (let match of matches) {
    matchedPoints.push(match.toFeature());
  }
  const matchedPointFeatureCollection_1b: turfHelpers.FeatureCollection<turfHelpers.Point> = turfHelpers.featureCollection(
    matchedPoints
  );

  const expected_1b_file = "test/geojson/points_1b.out.geojson";

  if (BUILD_TEST_OUPUT) {
    var expected_1b_out = JSON.stringify(matchedPointFeatureCollection_1b);
    fs.writeFileSync(expected_1b_file, expected_1b_out);
  }

  const expected_1b_in = fs.readFileSync(expected_1b_file);
  const expected_1b: {} = JSON.parse(expected_1b_in.toLocaleString());

  t.deepEqual(expected_1b, matchedPointFeatureCollection_1b);

  t.end();
});

test("match lines 1", async (t: any) => {
  // test polygon (dc area)
  const content = fs.readFileSync("test/geojson/sf_centerlines.sample.geojson");
  var linesIn: turfHelpers.FeatureCollection<turfHelpers.LineString> = JSON.parse(
    content.toLocaleString()
  );

  var cleanedLines = new CleanedLines(linesIn);
  var lines: turfHelpers.FeatureCollection<turfHelpers.LineString> = turfHelpers.featureCollection(
    cleanedLines.clean
  );

  var params = new TilePathParams();
  params.source = "osm/planet-180430";
  params.tileHierarchy = 6;

  //test matcher point candidates
  var matcher = new Graph(envelope(lines), params);
  await matcher.buildGraph();

  var matchedLines = turfHelpers.featureCollection([]);
  for (var line of lines.features) {
    var pathCandidate = await matcher.matchGeom(line);
    matchedLines.features.push(pathCandidate.matchedPath);
  }

  const expected_1a_file = "test/geojson/sf_centerlines.sample.out.geojson";
  if (BUILD_TEST_OUPUT) {
    var expected_1a_out: string = JSON.stringify(matchedLines);
    fs.writeFileSync(expected_1a_file, expected_1a_out);
  }

  const expected_1a_in = fs.readFileSync(expected_1a_file);
  const expected_1a: {} = JSON.parse(expected_1a_in.toLocaleString());
  t.deepEqual(matchedLines, expected_1a);

  t.end();
});

test("match lines 2 -- snapping and directed edges", async (t: any) => {
  // test polygon (dc area)
  const content = fs.readFileSync("test/geojson/line-directed-test.in.geojson");
  var linesIn: turfHelpers.FeatureCollection<turfHelpers.LineString> = JSON.parse(
    content.toLocaleString()
  );

  var cleanedLines = new CleanedLines(linesIn);
  var lines: turfHelpers.FeatureCollection<turfHelpers.LineString> = turfHelpers.featureCollection(
    cleanedLines.clean
  );

  var params = new TilePathParams();
  params.source = "osm/planet-180430";
  params.tileHierarchy = 6;

  //test matcher point candidates
  var matcher = new Graph(envelope(lines), params);
  await matcher.buildGraph();

  var matchedLines = turfHelpers.featureCollection([]);
  for (var line of lines.features) {
    var pathCandidate = await matcher.matchGeom(line);
    matchedLines.features.push(pathCandidate.matchedPath);
  }

  const expected_1a_file =
    "test/geojson/line-directed-test-snapped.out.geojson";
  if (BUILD_TEST_OUPUT) {
    var expected_1a_out: string = JSON.stringify(matchedLines);
    fs.writeFileSync(expected_1a_file, expected_1a_out);
  }

  const expected_1a_in = fs.readFileSync(expected_1a_file);
  const expected_1a: {} = JSON.parse(expected_1a_in.toLocaleString());
  t.deepEqual(matchedLines, expected_1a);

  matcher.snapIntersections = false;

  var matchedLines = turfHelpers.featureCollection([]);
  for (var line of lines.features) {
    var pathCandidate = await matcher.matchGeom(line);
    matchedLines.features.push(pathCandidate.matchedPath);
  }

  const expected_1b_file =
    "test/geojson/line-directed-test-unsnapped.out.geojson";
  if (BUILD_TEST_OUPUT) {
    var expected_1b_out: string = JSON.stringify(matchedLines);
    fs.writeFileSync(expected_1b_file, expected_1b_out);
  }

  const expected_1b_in = fs.readFileSync(expected_1b_file);
  const expected_1b: {} = JSON.parse(expected_1b_in.toLocaleString());
  t.deepEqual(matchedLines, expected_1b);

  t.end();
});
