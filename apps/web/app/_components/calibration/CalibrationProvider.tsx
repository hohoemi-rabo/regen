"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NO_CALIBRATION, normalizeCalibration, type Calibration } from "@regen/core";

/**
 * 「じぶん補正」(F-4-5)の保管庫。
 *
 * **係数はブラウザのローカル保存にとどめる。** サーバーにも共有URLにも出さない。
 * localStorage が使えない環境(プライベートモード・ストレージ無効)でも既定値で動くよう、
 * 読み書きはすべて try/catch で包む。
 *
 * サーバーが返すHTMLは常に無補正。初回描画のあとに useEffect で読み込んで差し替える
 * (ハイドレーション不一致を避ける。静的HTMLと印刷の初期状態が無補正なのも都合がよい)。
 */
const KEY = "regen.calibration.v1";

interface Store {
  /** 適用中の係数。無補正なら null */
  calibration: Calibration | null;
  /** localStorageの読み込みが済んだか(済むまでは無補正で描く) */
  ready: boolean;
  save: (c: Calibration) => void;
  clear: () => void;
}

const CalibrationContext = createContext<Store>({
  calibration: null,
  ready: false,
  save: () => {},
  clear: () => {},
});

function read(): Calibration | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    // 利用者が書き換えられる入力なので、必ず正規化を通す
    return normalizeCalibration(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function CalibrationProvider({ children }: { children: React.ReactNode }) {
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCalibration(read());
    setReady(true);
    // 別タブで補正を変えたらこちらにも反映する
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === KEY) setCalibration(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const save = useCallback((c: Calibration) => {
    setCalibration(c);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(c));
    } catch {
      // 保存できなくても、このタブの表示には反映されている
    }
  }, []);

  const clear = useCallback(() => {
    setCalibration(null);
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // 消せなくても状態は既定値に戻っている
    }
  }, []);

  const value = useMemo(() => ({ calibration, ready, save, clear }), [calibration, ready, save, clear]);
  return <CalibrationContext.Provider value={value}>{children}</CalibrationContext.Provider>;
}

export function useCalibration(): Store {
  return useContext(CalibrationContext);
}

/** 適用する係数。未適用のときは恒等を返すので、呼び出し側で分岐しなくてよい */
export function useActiveCalibration(): Calibration {
  return useCalibration().calibration ?? NO_CALIBRATION;
}
