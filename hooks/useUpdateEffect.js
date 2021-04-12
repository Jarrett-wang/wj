import { useEffect, useRef } from 'react';

// 升级useEffect，页面初次渲染时不执行, 仅当依赖变化时执行
export const useUpdateEffect = (effect, deps) => {
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
    } else {
      return effect();
    }
  }, deps);
};


