import { describe, it, expect } from "vitest";
import { decode, guessColumns, parseCsv, readCsvFile, toHours, toMonth, toNumber, CsvError } from "./csv";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const file = (name: string, body: Uint8Array | string) =>
  new File([body as BlobPart], name, { type: "text/csv" });

describe("CSVの読み取り(F-4-1)", () => {
  describe("パーサ", () => {
    it("引用符・エスケープ・CRLF・空行を扱う", () => {
      const rows = parseCsv('a,b,c\r\n1,"x,y",3\r\n\r\n4,"い""ろ",6\r\n');
      expect(rows).toEqual([
        ["a", "b", "c"],
        ["1", "x,y", "3"],
        ["4", 'い"ろ', "6"],
      ]);
    });

    it("引用符の中の改行を1セルとして保つ", () => {
      expect(parseCsv('a,b\n1,"二\n行"\n')).toEqual([["a", "b"], ["1", "二\n行"]]);
    });

    it("最終行に改行が無くても読む", () => {
      expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    });
  });

  describe("文字コード", () => {
    it("BOM付きUTF-8はBOMを落とす", () => {
      const { text, encoding } = decode(enc("﻿日付,距離\n"));
      expect(text.startsWith("日付")).toBe(true);
      expect(encoding).toBe("utf-8");
    });

    it("Shift_JISを読み直す(デジタコの書き出しでよくある)", () => {
      // "日付" を Shift_JIS で符号化したもの
      const sjis = new Uint8Array([0x93, 0xfa, 0x95, 0x74, 0x2c, 0x8b, 0x97, 0x97, 0xa3]);
      const { text, encoding } = decode(sjis.buffer as ArrayBuffer);
      expect(encoding).toBe("shift_jis");
      expect(text).toBe("日付,距離");
    });
  });

  describe("ファイルの検証(異常系)", () => {
    it("空ファイルは弾く", async () => {
      await expect(readCsvFile(file("a.csv", ""))).rejects.toThrow(CsvError);
    });

    it("見出しだけのファイルは弾く", async () => {
      await expect(readCsvFile(file("a.csv", "日付,距離,電力量\n"))).rejects.toThrow(/見出し行しか/);
    });

    it("列が足りないファイルは弾く", async () => {
      await expect(readCsvFile(file("a.csv", "日付,距離\n2026-01-05,120\n"))).rejects.toThrow(/3列以上/);
    });

    it("大きすぎるファイルは弾く", async () => {
      const big = file("a.csv", "x".repeat(6 * 1024 * 1024));
      await expect(readCsvFile(big)).rejects.toThrow(/大きすぎ/);
    });

    it("列数がぶれる行は幅に揃える(末尾が欠けた書き出し)", async () => {
      const csv = await readCsvFile(file("a.csv", "日付,距離,電力量\n2026-01-05,120\n2026-01-06,80,50,x\n"));
      expect(csv.rows.every((r) => r.length === 3)).toBe(true);
      expect(csv.rows[0]).toEqual(["2026-01-05", "120", ""]);
    });
  });

  describe("値の解釈", () => {
    it("3桁区切り・単位つきの数値を読む", () => {
      expect(toNumber("1,234.5")).toBe(1234.5);
      expect(toNumber("12.3km")).toBe(12.3);
      expect(toNumber(" 80 ")).toBe(80);
      expect(toNumber("")).toBeNull();
      expect(toNumber("−")).toBeNull();
      expect(toNumber("abc")).toBeNull();
    });

    it("いろいろな日付から月を取る", () => {
      expect(toMonth("2026-01-05")).toBe(1);
      expect(toMonth("2026/12/5")).toBe(12);
      expect(toMonth("20260805")).toBe(8);
      expect(toMonth("2026年3月5日")).toBe(3);
      expect(toMonth("7/15")).toBe(7);
      expect(toMonth("2026-13-01")).toBeNull();
      expect(toMonth("なし")).toBeNull();
    });

    it("運行時間を時間に直す", () => {
      expect(toHours("8:30")).toBeCloseTo(8.5, 10);
      expect(toHours("8時間30分")).toBeCloseTo(8.5, 10);
      expect(toHours("7.25")).toBeCloseTo(7.25, 10);
      expect(toHours("")).toBeNull();
    });
  });

  describe("列の推定", () => {
    it("日本語の見出しから当てる", () => {
      expect(guessColumns(["日付", "走行距離", "消費電力量", "運行時間"])).toEqual({
        date: 0, distance: 1, consumption: 2, duration: 3,
      });
    });

    it("英語の見出しからも当てる", () => {
      const g = guessColumns(["date", "distance_km", "fuel_l", "note"]);
      expect(g.date).toBe(0);
      expect(g.distance).toBe(1);
      expect(g.consumption).toBe(2);
    });

    it("「日時」を日付に取ってから「時間」を運行時間に取る(取り違えない)", () => {
      const g = guessColumns(["日時", "運行時間", "走行距離", "給油量"]);
      expect(g.date).toBe(0);
      expect(g.duration).toBe(1);
      expect(g.distance).toBe(2);
      expect(g.consumption).toBe(3);
    });

    it("当たらない列は -1", () => {
      const g = guessColumns(["A", "B", "C"]);
      expect(g.date).toBe(-1);
      expect(g.duration).toBe(-1);
    });
  });
});
