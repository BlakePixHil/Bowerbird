import { describe, expect, it } from "vitest";
import { axisDate, dollars, shortMoney } from "./format";
import { areaPath, bandPath, barPath, linePath, n1, ringDash, ringTick } from "./paths";
import { extent, headroom, linear, nearestPoint, niceScale, slotAt, tooltipShift } from "./scale";

describe("linear", () => {
  it("maps a domain onto a range, including flipped ranges for SVG y", () => {
    const y = linear([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });

  it("puts everything at the start when the domain is a single value", () => {
    expect(linear([5, 5], [0, 10])(5)).toBe(0);
  });
});

describe("niceScale", () => {
  it("picks tidy steps", () => {
    expect(niceScale(25_140_000, 27_090_000, 4)).toEqual({
      lo: 25_000_000,
      hi: 27_500_000,
      step: 500_000,
      ticks: [25_000_000, 25_500_000, 26_000_000, 26_500_000, 27_000_000, 27_500_000],
    });
    expect(niceScale(0, 222_000, 4).step).toBe(100_000);
    expect(niceScale(0, 1_500_000, 3).step).toBe(500_000);
    expect(niceScale(0, 900, 4).step).toBe(250);
  });

  it("copes with a flat or reversed range", () => {
    expect(niceScale(500, 500)).toMatchObject({ lo: 500, hi: 501 });
    expect(niceScale(10, 0).lo).toBe(0);
  });
});

describe("headroom and extent", () => {
  it("leaves 10% above the top value, and never returns zero", () => {
    expect(headroom([100, 200])).toBeCloseTo(220);
    expect(headroom([])).toBe(1);
    expect(headroom([-5])).toBe(1);
  });

  it("always includes zero", () => {
    expect(extent([300, 500])).toEqual([0, 500]);
    expect(extent([-200, 100])).toEqual([-200, 100]);
    expect(extent([])).toEqual([0, 1]);
  });
});

describe("pointer helpers", () => {
  it("finds the nearest point and the slot under the pointer", () => {
    expect(nearestPoint(0, 31)).toBe(0);
    expect(nearestPoint(0.5, 31)).toBe(15);
    expect(nearestPoint(1.2, 31)).toBe(30);
    expect(slotAt(0.99, 12)).toBe(11);
    expect(slotAt(1, 12)).toBe(11);
    expect(slotAt(-0.1, 12)).toBe(0);
  });

  it("keeps the tooltip inside the chart", () => {
    expect(tooltipShift(5)).toBe("translateX(14px)");
    expect(tooltipShift(50)).toBe("translateX(-50%)");
    expect(tooltipShift(95)).toBe("translateX(calc(-100% - 14px))");
  });
});

describe("paths", () => {
  it("rounds coordinates to one place and never writes -0", () => {
    expect(n1(1.26)).toBe("1.3");
    expect(n1(-0.01)).toBe("0");
    expect(
      linePath([
        [0, 10],
        [5.55, 2],
      ]),
    ).toBe("M0 10 L5.6 2");
  });

  it("closes an area down to the baseline", () => {
    expect(
      areaPath(
        [
          [0, 10],
          [10, 5],
        ],
        20,
      ),
    ).toBe("M0 10 L10 5 L10 20 L0 20 Z");
    expect(areaPath([], 20)).toBe("");
  });

  it("joins a band's top edge to its bottom edge in reverse", () => {
    expect(
      bandPath(
        [
          [0, 1],
          [10, 2],
        ],
        [
          [0, 5],
          [10, 6],
        ],
      ),
    ).toBe("M0 1 L10 2 L10 6 L0 5 Z");
  });

  it("rounds only the far end of a bar, up or down", () => {
    expect(barPath(0, 14, 100, 60)).toBe("M0 100 V64 Q0 60 4 60 H10 Q14 60 14 64 V100 Z");
    expect(barPath(0, 14, 100, 140)).toBe("M0 100 V136 Q0 140 4 140 H10 Q14 140 14 136 V100 Z");
    expect(barPath(0, 14, 100, 100.2)).toBe("");
  });

  it("draws part of a ring and a tick across it", () => {
    const quarter = ringDash(0.25, 10);
    expect(quarter).toBe(`${n1((Math.PI * 20) / 4)} ${n1(Math.PI * 20)}`);
    expect(ringDash(2, 10)).toBe(`${n1(Math.PI * 20)} ${n1(Math.PI * 20)}`);
    const top = ringTick(0, 70, 58, 10);
    expect(top.x1).toBeCloseTo(70);
    expect(top.y1).toBeCloseTo(22);
    expect(top.y2).toBeCloseTo(2);
    const right = ringTick(0.25, 70, 58, 10);
    expect(right.x1).toBeCloseTo(118);
    expect(right.y1).toBeCloseTo(70);
  });
});

describe("chart labels", () => {
  it("formats money the short way for axes", () => {
    expect(dollars(222_049)).toBe("$2,220");
    expect(shortMoney(100_000)).toBe("$1,000");
    expect(shortMoney(950_000)).toBe("$9,500");
    expect(shortMoney(1_500_000)).toBe("$15k");
    expect(shortMoney(27_000_000)).toBe("$270k");
    expect(shortMoney(27_050_000)).toBe("$270.5k");
    expect(shortMoney(125_000_000)).toBe("$1.25m");
    expect(shortMoney(-2_500_000)).toBe("−$25k");
  });

  it("writes axis dates in capitals", () => {
    expect(axisDate("2026-10-01")).toBe("1 OCT");
    expect(axisDate("2026-12-31")).toBe("31 DEC");
  });
});
