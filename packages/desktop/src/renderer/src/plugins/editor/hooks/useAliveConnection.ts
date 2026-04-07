import { useCallback, useEffect, useRef, useState } from "react";

interface UseAliveConnectionOptions<T> {
  /** 检测函数，返回结果用于判断连接状态 */
  checkFn: () => Promise<T>;
  /** 判断返回值是否表示连接正常 */
  isAlive: (result: T) => boolean;
  /** 检测间隔（毫秒），默认 15000 */
  interval?: number;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 连接断开时的回调 */
  onDisconnect?: () => void;
}

interface UseAliveConnectionReturn {
  /** 当前连接状态 */
  active: boolean;
  /** 手动触发检测 */
  check: () => Promise<void>;
}

export function useAliveConnection<T>(
  options: UseAliveConnectionOptions<T>,
): UseAliveConnectionReturn {
  const { checkFn, isAlive, interval = 15000, enabled = true, onDisconnect } = options;
  const [active, setActive] = useState(true);

  const checkFnRef = useRef(checkFn);
  checkFnRef.current = checkFn;
  const isAliveRef = useRef(isAlive);
  isAliveRef.current = isAlive;
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  const check = useCallback(async () => {
    try {
      const result = await checkFnRef.current();
      const alive = isAliveRef.current(result);
      setActive(alive);
      if (!alive) {
        onDisconnectRef.current?.();
      }
    } catch {
      setActive(false);
      onDisconnectRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setInterval(check, interval);
    return () => {
      clearInterval(timer);
    };
  }, [enabled, interval, check]);

  return { active, check };
}
