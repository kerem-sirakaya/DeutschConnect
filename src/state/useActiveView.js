import { useEffect, useRef } from 'react';

// A completed background save must not redirect or clear a newly opened form.
export default function useActiveView() {
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  return active;
}
