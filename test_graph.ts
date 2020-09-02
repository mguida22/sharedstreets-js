import * as fs from "fs";

import * as turfHelpers from "@turf/helpers";
import envelope from "@turf/envelope";

import { TilePathParams } from "./src/index";

import { Graph } from "./src/graph";

import test from "tape";

test("sharedstreets -- graph test", async (t: any) => {
  var params = new TilePathParams();
  params.source = "osm/planet-181224";
  params.tileHierarchy = 7;

  // test polygon (dc area)
  const content = fs.readFileSync("test/geojson/test_route.geojson");
  var lineIn: turfHelpers.FeatureCollection<turfHelpers.LineString> = JSON.parse(
    content.toLocaleString()
  );
  var graph = new Graph(envelope(lineIn), params);
  await graph.buildGraph();

  t.equal(graph.id, "e8958d1c-1464-373e-b6b8-5a4959e309d2");

  lineIn.features[0].geometry.coordinates.reverse();

  await graph.cleanup();

  t.end();
});

test("sharedstreets -- multiple graphs can be created", async (t: any) => {
  const expectedId = "e8958d1c-1464-373e-b6b8-5a4959e309d2";

  var params = new TilePathParams();
  params.source = "osm/planet-181224";
  params.tileHierarchy = 7;

  // test polygon (dc area)
  const content = fs.readFileSync("test/geojson/test_route.geojson");
  var lineIn: turfHelpers.FeatureCollection<turfHelpers.LineString> = JSON.parse(
    content.toLocaleString()
  );
  var graph = new Graph(envelope(lineIn), params);
  await graph.buildGraph();

  t.equal(graph.id, expectedId);

  lineIn.features[0].geometry.coordinates.reverse();

  await graph.cleanup();

  var graph2 = new Graph(envelope(lineIn), params);
  await graph2.buildGraph();

  // both graphs should have the same id, since they're built
  // from the same inputs.
  t.equal(graph2.id, expectedId);

  await graph2.cleanup();

  t.end();
});
