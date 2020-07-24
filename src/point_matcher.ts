import * as turfHelpers from "@turf/helpers";

import along from "@turf/along";
import bearing from "@turf/bearing";
import distance from "@turf/distance";
import nearestPointOnLine from "@turf/nearest-point-on-line";

import { TileIndex } from "./tile_index";
import { TilePathParams, TileType } from "./tiles";
import { Feature, LineString } from "@turf/buffer/node_modules/@turf/helpers";
import { RoadClass, SharedStreetsReference } from "sharedstreets-types";
import { SharedStreetsGeometry } from "sharedstreets-pbf/proto/sharedstreets";

const DEFAULT_SEARCH_RADIUS = 25;
const DEFAULT_LENGTH_TOLERANCE = 0.1;
const DEFAULT_BEARING_TOLERANCE = 15; // 360 +/- tolerance

// TODO need to pull this from PBF enum defintion

// @property {number} Motorway=0 Motorway value
//  * @property {number} Trunk=1 Trunk value
//  * @property {number} Primary=2 Primary value
//  * @property {number} Secondary=3 Secondary value
//  * @property {number} Tertiary=4 Tertiary value
//  * @property {number} Residential=5 Residential value
//  * @property {number} Unclassified=6 Unclassified value
//  * @property {number} Service=7 Service value
//  * @property {number} Other=8 Other value

function angleDelta(a1, a2) {
  var delta = 180 - Math.abs(Math.abs(a1 - a2) - 180);
  return delta;
}

function normalizeAngle(a) {
  if (a < 0) return a + 360;
  return a;
}

export enum ReferenceDirection {
  FORWARD = "forward",
  BACKWARD = "backward",
}

export enum ReferenceSideOfStreet {
  RIGHT = "right",
  LEFT = "left",
  UNKNOWN = "unknown",
}

interface SortableCanddate {
  score: number;
  calcScore(): number;
}

export class PointCandidate implements SortableCanddate {
  score: number;

  searchPoint: turfHelpers.Feature<turfHelpers.Point>;
  pointOnLine: turfHelpers.Feature<turfHelpers.Point>;
  snappedPoint: turfHelpers.Feature<turfHelpers.Point>;

  geometryId: string;
  referenceId: string;
  roadClass: RoadClass;
  direction: ReferenceDirection;
  streetname: string;
  referenceLength: number;
  location: number;
  bearing: number;
  interceptAngle: number;
  sideOfStreet: ReferenceSideOfStreet;
  oneway: boolean;

  calcScore(): number {
    if (!this.score) {
      // score for snapped points are average of distance to point on line distance and distance to snapped ponit
      if (this.snappedPoint)
        this.score =
          (this.pointOnLine.properties.dist +
            distance(this.searchPoint, this.snappedPoint, {
              units: "meters",
            })) /
          2;
      else this.score = this.pointOnLine.properties.dist;
    }
    return this.score;
  }

  toFeature(): turfHelpers.Feature<turfHelpers.Point> {
    this.calcScore();

    var feature: turfHelpers.Feature<turfHelpers.Point> = turfHelpers.feature(
      this.pointOnLine.geometry,
      {
        score: this.score,
        location: this.location,
        referenceLength: this.referenceLength,
        geometryId: this.geometryId,
        referenceId: this.referenceId,
        direction: this.direction,
        bearing: this.bearing,
        sideOfStreet: this.sideOfStreet,
        interceptAngle: this.interceptAngle,
      }
    );

    return feature;
  }
}

export class PointMatcher {
  tileIndex: TileIndex;

  searchRadius: number = DEFAULT_SEARCH_RADIUS;
  bearingTolerance: number = DEFAULT_BEARING_TOLERANCE;
  lengthTolerance: number = DEFAULT_LENGTH_TOLERANCE;

  includeIntersections: boolean = false;
  includeStreetnames: boolean = false;
  ignoreDirection: boolean = false;
  snapToIntersections: boolean = false;
  snapTopology: boolean = false;
  snapSideOfStreet: ReferenceSideOfStreet = ReferenceSideOfStreet.UNKNOWN;

  tileParams: TilePathParams;

  constructor(
    _extent: turfHelpers.Feature<turfHelpers.Polygon> = null,
    params: TilePathParams,
    existingTileIndex: TileIndex = null
  ) {
    this.tileParams = params;

    if (existingTileIndex) this.tileIndex = existingTileIndex;
    else this.tileIndex = new TileIndex();
  }

  directionForRefId(refId: string): ReferenceDirection {
    var ref = <SharedStreetsReference>this.tileIndex.objectIndex.get(refId);

    if (ref) {
      var geom: SharedStreetsGeometry = <SharedStreetsGeometry>(
        this.tileIndex.objectIndex.get(ref["geometryId"])
      );

      if (geom) {
        if (geom["forwardReferenceId"] === ref["id"])
          return ReferenceDirection.FORWARD;
        else if (geom["backReferenceId"] === ref["id"])
          return ReferenceDirection.BACKWARD;
      }
    }
    return null;
  }

  toIntersectionIdForRefId(refId: string): string {
    var ref: SharedStreetsReference = <SharedStreetsReference>(
      this.tileIndex.objectIndex.get(refId)
    );
    return ref.locationReferences[ref.locationReferences.length - 1]
      .intersectionId;
  }

  fromIntersectionIdForRefId(refId: string): string {
    var ref: SharedStreetsReference = <SharedStreetsReference>(
      this.tileIndex.objectIndex.get(refId)
    );
    return ref.locationReferences[0].intersectionId;
  }

  async getPointCandidateFromRefId(
    searchPoint: turfHelpers.Feature<turfHelpers.Point>,
    refId: string,
    searchBearing: number
  ): Promise<PointCandidate> {
    var reference = <SharedStreetsReference>(
      this.tileIndex.objectIndex.get(refId)
    );
    var geometry = <SharedStreetsGeometry>(
      this.tileIndex.objectIndex.get(reference.geometryId)
    );
    var geometryFeature = <Feature<LineString>>(
      this.tileIndex.featureIndex.get(reference.geometryId)
    );

    var direction = ReferenceDirection.FORWARD;
    if (geometry.backReferenceId && geometry.backReferenceId === refId)
      direction = ReferenceDirection.BACKWARD;

    var pointOnLine = nearestPointOnLine(geometryFeature, searchPoint, {
      units: "meters",
    });

    if (pointOnLine.properties.dist < this.searchRadius) {
      var refLength = 0;
      for (var lr of reference.locationReferences) {
        if (lr.distanceToNextRef)
          refLength = refLength + lr.distanceToNextRef / 100;
      }

      var interceptBearing = normalizeAngle(bearing(pointOnLine, searchPoint));

      var i = pointOnLine.properties.index;

      if (geometryFeature.geometry.coordinates.length <= i + 1) i = i - 1;

      var lineBearing = bearing(
        geometryFeature.geometry.coordinates[i],
        geometryFeature.geometry.coordinates[i + 1]
      );

      if (direction === ReferenceDirection.BACKWARD) lineBearing += 180;

      lineBearing = normalizeAngle(lineBearing);

      var pointCandidate: PointCandidate = new PointCandidate();

      pointCandidate.searchPoint = searchPoint;
      pointCandidate.pointOnLine = pointOnLine;

      pointCandidate.geometryId = geometryFeature.properties.id;
      pointCandidate.referenceId = reference.id;
      pointCandidate.roadClass = geometry.roadClass;

      pointCandidate.direction = direction;
      pointCandidate.referenceLength = refLength;

      if (direction === ReferenceDirection.FORWARD)
        pointCandidate.location = pointOnLine.properties.location;
      else
        pointCandidate.location = refLength - pointOnLine.properties.location;

      pointCandidate.bearing = normalizeAngle(lineBearing);
      pointCandidate.interceptAngle = normalizeAngle(
        interceptBearing - lineBearing
      );

      pointCandidate.sideOfStreet = ReferenceSideOfStreet.UNKNOWN;
      if (pointCandidate.interceptAngle < 180) {
        pointCandidate.sideOfStreet = ReferenceSideOfStreet.RIGHT;
      }
      if (pointCandidate.interceptAngle > 180) {
        pointCandidate.sideOfStreet = ReferenceSideOfStreet.LEFT;
      }

      if (geometry.backReferenceId) pointCandidate.oneway = false;
      else pointCandidate.oneway = true;

      // check bearing and add to candidate list
      if (
        !searchBearing ||
        angleDelta(searchBearing, lineBearing) < this.bearingTolerance
      )
        return pointCandidate;
    }

    return null;
  }

  getPointCandidateFromGeom(
    searchPoint: turfHelpers.Feature<turfHelpers.Point>,
    pointOnLine: turfHelpers.Feature<turfHelpers.Point>,
    candidateGeom: SharedStreetsGeometry,
    candidateGeomFeature: Feature<LineString>,
    searchBearing: number,
    direction: ReferenceDirection
  ): PointCandidate {
    if (pointOnLine.properties.dist < this.searchRadius) {
      var reference: SharedStreetsReference;

      if (direction === ReferenceDirection.FORWARD) {
        reference = <SharedStreetsReference>(
          this.tileIndex.objectIndex.get(candidateGeom.forwardReferenceId)
        );
      } else {
        if (candidateGeom.backReferenceId)
          reference = <SharedStreetsReference>(
            this.tileIndex.objectIndex.get(candidateGeom.backReferenceId)
          );
        else return null; // no back-reference
      }

      var refLength = 0;
      for (var lr of reference.locationReferences) {
        if (lr.distanceToNextRef)
          refLength = refLength + lr.distanceToNextRef / 100;
      }

      var interceptBearing = normalizeAngle(bearing(pointOnLine, searchPoint));

      var i = pointOnLine.properties.index;

      if (candidateGeomFeature.geometry.coordinates.length <= i + 1) i = i - 1;

      var lineBearing = bearing(
        candidateGeomFeature.geometry.coordinates[i],
        candidateGeomFeature.geometry.coordinates[i + 1]
      );

      if (direction === ReferenceDirection.BACKWARD) lineBearing += 180;

      lineBearing = normalizeAngle(lineBearing);

      var pointCandidate: PointCandidate = new PointCandidate();

      pointCandidate.searchPoint = searchPoint;
      pointCandidate.pointOnLine = pointOnLine;

      pointCandidate.geometryId = candidateGeomFeature.properties.id;
      pointCandidate.referenceId = reference.id;
      pointCandidate.roadClass = candidateGeom.roadClass;

      // if(this.includeStreetnames) {
      // 	var metadata = await this.cache.metadataById(pointCandidate.geometryId);
      // 	pointCandidate.streetname = metadata.name;
      // }

      pointCandidate.direction = direction;
      pointCandidate.referenceLength = refLength;

      if (direction === ReferenceDirection.FORWARD)
        pointCandidate.location = pointOnLine.properties.location;
      else
        pointCandidate.location = refLength - pointOnLine.properties.location;

      pointCandidate.bearing = normalizeAngle(lineBearing);
      pointCandidate.interceptAngle = normalizeAngle(
        interceptBearing - lineBearing
      );

      pointCandidate.sideOfStreet = ReferenceSideOfStreet.UNKNOWN;
      if (pointCandidate.interceptAngle < 180) {
        pointCandidate.sideOfStreet = ReferenceSideOfStreet.RIGHT;
      }
      if (pointCandidate.interceptAngle > 180) {
        pointCandidate.sideOfStreet = ReferenceSideOfStreet.LEFT;
      }

      if (candidateGeom.backReferenceId) pointCandidate.oneway = false;
      else pointCandidate.oneway = true;

      // check bearing and add to candidate list
      if (
        !searchBearing ||
        angleDelta(searchBearing, lineBearing) < this.bearingTolerance
      )
        return pointCandidate;
    }

    return null;
  }

  async getPointCandidates(
    searchPoint: turfHelpers.Feature<turfHelpers.Point>,
    searchBearing: number,
    maxCandidates: number
  ): Promise<PointCandidate[]> {
    this.tileIndex.addTileType(TileType.REFERENCE);
    var candidateFeatures = await this.tileIndex.nearby(
      searchPoint,
      TileType.GEOMETRY,
      this.searchRadius,
      this.tileParams
    );

    var candidates: PointCandidate[] = new Array();

    if (candidateFeatures && candidateFeatures.features) {
      for (var candidateFeature of candidateFeatures.features) {
        var candidateGeom: SharedStreetsGeometry = <SharedStreetsGeometry>(
          this.tileIndex.objectIndex.get(candidateFeature.properties.id)
        );
        var candidateGeomFeature: turfHelpers.Feature<turfHelpers.LineString> = <
          turfHelpers.Feature<turfHelpers.LineString>
        >this.tileIndex.featureIndex.get(candidateFeature.properties.id);
        var pointOnLine = nearestPointOnLine(
          candidateGeomFeature,
          searchPoint,
          { units: "meters" }
        );

        var forwardCandidate = await this.getPointCandidateFromGeom(
          searchPoint,
          pointOnLine,
          candidateGeom,
          candidateGeomFeature,
          searchBearing,
          ReferenceDirection.FORWARD
        );
        var backwardCandidate = await this.getPointCandidateFromGeom(
          searchPoint,
          pointOnLine,
          candidateGeom,
          candidateGeomFeature,
          searchBearing,
          ReferenceDirection.BACKWARD
        );

        if (forwardCandidate != null) {
          var snapped = false;
          if (this.snapToIntersections) {
            if (forwardCandidate.location < this.searchRadius) {
              var snappedForwardCandidate1 = Object.assign(
                new PointCandidate(),
                forwardCandidate
              );
              snappedForwardCandidate1.location = 0;

              snappedForwardCandidate1.snappedPoint = along(
                candidateGeomFeature,
                0,
                { units: "meters" }
              );

              candidates.push(snappedForwardCandidate1);
              snapped = true;
            }

            if (
              forwardCandidate.referenceLength - forwardCandidate.location <
              this.searchRadius
            ) {
              var snappedForwardCandidate2 = Object.assign(
                new PointCandidate(),
                forwardCandidate
              );
              snappedForwardCandidate2.location =
                snappedForwardCandidate2.referenceLength;

              snappedForwardCandidate2.snappedPoint = along(
                candidateGeomFeature,
                snappedForwardCandidate2.referenceLength,
                { units: "meters" }
              );

              candidates.push(snappedForwardCandidate2);
              snapped = true;
            }
          }

          if (!snapped) {
            candidates.push(forwardCandidate);
          }
        }

        if (backwardCandidate != null) {
          var snapped = false;

          if (this.snapToIntersections) {
            if (backwardCandidate.location < this.searchRadius) {
              var snappedBackwardCandidate1: PointCandidate = Object.assign(
                new PointCandidate(),
                backwardCandidate
              );
              snappedBackwardCandidate1.location = 0;

              // not reversing the geom so snap to end on backRefs
              snappedBackwardCandidate1.snappedPoint = along(
                candidateGeomFeature,
                snappedBackwardCandidate1.referenceLength,
                { units: "meters" }
              );

              candidates.push(snappedBackwardCandidate1);
              snapped = true;
            }

            if (
              backwardCandidate.referenceLength - backwardCandidate.location <
              this.searchRadius
            ) {
              var snappedBackwardCandidate2 = Object.assign(
                new PointCandidate(),
                backwardCandidate
              );
              snappedBackwardCandidate2.location =
                snappedBackwardCandidate2.referenceLength;

              // not reversing the geom so snap to start on backRefs
              snappedBackwardCandidate2.snappedPoint = along(
                candidateGeomFeature,
                0,
                { units: "meters" }
              );

              candidates.push(snappedBackwardCandidate2);
              snapped = true;
            }
          }

          if (!snapped) {
            candidates.push(backwardCandidate);
          }
        }
      }
    }

    var sortedCandidates = candidates.sort((p1, p2) => {
      p1.calcScore();
      p2.calcScore();
      if (p1.score > p2.score) {
        return 1;
      }
      if (p1.score < p2.score) {
        return -1;
      }
      return 0;
    });

    if (sortedCandidates.length > maxCandidates) {
      sortedCandidates = sortedCandidates.slice(0, maxCandidates);
    }

    return sortedCandidates;
  }
}
