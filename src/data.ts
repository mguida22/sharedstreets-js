export function getBinCountFromLength(referenceLength, binSize) {
  var numBins = Math.floor(referenceLength / binSize) + 1;
  return numBins;
}

export function getBinLength(referenceLength, binSize) {
  return referenceLength / getBinCountFromLength(referenceLength, binSize);
}

export function getBinPositionFromLocation(referenceLength, binSize, location) {
  var bin = Math.floor(location / getBinLength(referenceLength, binSize)) + 1;
  return bin;
}

export function generateBinId(referenceId, binCount, binPosition): string {
  var binId: string = referenceId + "{" + binCount;
  if (binPosition) binId = binId + ":" + binPosition;
  return binId;
}

export enum PeriodSize {
  OneSecond = 0,
  FiveSeconds = 1,
  TenSeconds = 2,
  FifteenSeconds = 3,
  ThirtySeconds = 4,
  OneMinute = 5,
  FiveMinutes = 6,
  TenMinutes = 7,
  FifteenMinutes = 8,
  ThirtyMinutes = 9,
  OneHour = 10,
  OneDay = 11,
  OneWeek = 12,
  OneMonth = 13,
  OneYear = 14,
}

class SharedStreetsBin {
  type: string;
  count: number;
  value: number;
}

class SharedStreetsLinearBins {
  referenceId: string;

  referenceLength: number;
  numberOfBins: number;

  bins: {};

  constructor(
    referenceId: string,
    referenceLength: number,
    numberOfBins: number
  ) {
    this.referenceId = referenceId;
    this.referenceLength = referenceLength;
    this.numberOfBins = numberOfBins; // defaults to one bin

    this.bins = {};
  }

  getId(): string {
    return generateBinId(this.referenceId, this.numberOfBins, null);
  }

  addBin(binPosition: number, type: string, count: number, value: number) {
    var bin = new SharedStreetsBin();
    bin.type = type;
    bin.count = count;
    bin.value = value;

    this.bins[binPosition] = bin;
  }
}

export class WeeklySharedStreetsLinearBins extends SharedStreetsLinearBins {
  periodSize: PeriodSize;

  constructor(
    referenceId: string,
    referenceLength: number,
    numberOfBins: number,
    periodSize: PeriodSize
  ) {
    super(referenceId, referenceLength, numberOfBins);
    this.periodSize = periodSize;
  }

  addPeriodBin(
    binPosition: number,
    period: number,
    type: string,
    count: number,
    value: number
  ) {
    var bin = new SharedStreetsBin();
    bin.type = type;
    bin.count = count;
    bin.value = value;

    if (!this.bins[binPosition]) {
      this.bins[binPosition] = {};
    }

    this.bins[binPosition][period] = bin;
  }

  getFilteredBins(
    binPosition: number,
    typeFilter: string,
    periodFilter: number[]
  ): SharedStreetsBin[] {
    var filteredBins = [];

    if (this.bins[binPosition]) {
      for (var period of Object.keys(this.bins[binPosition])) {
        if (periodFilter) {
          if (
            parseInt(period) < periodFilter[0] ||
            parseInt(period) > periodFilter[1]
          )
            continue;
        }
        if (typeFilter) {
          if (typeFilter !== this.bins[binPosition][period].type) continue;
        }
        filteredBins.push(this.bins[binPosition][period]);
      }
    }

    return filteredBins;
  }

  getHourOfDaySummary(typeFilter: string) {
    var filteredBins = new Map<number, SharedStreetsBin[]>();

    for (var binPosition of Object.keys(this.bins)) {
      for (var period of Object.keys(this.bins[binPosition])) {
        var hourOfDay = parseInt(period) % 23;
        if (hourOfDay > 23) hourOfDay = hourOfDay - 23;
        if (hourOfDay <= 0) hourOfDay = hourOfDay + 23;

        if (typeFilter) {
          if (typeFilter !== this.bins[binPosition][period].type) continue;
        }

        if (!filteredBins[hourOfDay]) filteredBins[hourOfDay] = [];

        filteredBins[hourOfDay].push(this.bins[binPosition][period]);
      }
    }

    return filteredBins;
  }

  getValueForBin(
    binPosition: number,
    typeFilter: string,
    periodFilter: number[]
  ) {
    var sum = 0;
    var filteredBins = this.getFilteredBins(
      binPosition,
      typeFilter,
      periodFilter
    );

    for (var bin of filteredBins) {
      sum = sum + bin.value;
    }

    return sum;
  }

  getCountForHoursOfDay(typeFilter) {
    var summary = this.getHourOfDaySummary(typeFilter);

    var hourOfDayCount = {};

    for (var hourOfDay of Object.keys(summary)) {
      hourOfDayCount[hourOfDay] = 0;
      for (var bin of summary[hourOfDay]) {
        hourOfDayCount[hourOfDay] = hourOfDayCount[hourOfDay] + bin.count;
      }
    }

    return hourOfDayCount;
  }

  getCountForBin(
    binPosition: number,
    typeFilter: string,
    periodFilter: number[]
  ) {
    var sum = 0;
    var filteredBins = this.getFilteredBins(
      binPosition,
      typeFilter,
      periodFilter
    );

    for (var bin of filteredBins) {
      sum = sum + bin.count;
    }

    return sum;
  }

  getCountForEdge(typeFilter: string, periodFilter: number[]) {
    var sum = 0;

    for (var binPosition = 0; binPosition < this.numberOfBins; binPosition++) {
      var filteredBins = this.getFilteredBins(
        binPosition,
        typeFilter,
        periodFilter
      );

      for (var bin of filteredBins) {
        sum = sum + bin.count;
      }
    }

    return sum;
  }
}
