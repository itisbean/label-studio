import { useCallback, useEffect, useReducer, useRef } from "react";

export interface QueryOptions {
  query?: Record<string, any>;
  pause?: boolean;
  hydrate?: Omit<QueryOptions, 'hydrate' | 'pause'>;
}
export interface AbortableQueryOptions extends Omit<QueryOptions , 'hydrate'> {
  signal: AbortSignal;
  hydrate?: Omit<QueryOptions, 'hydrate' | 'pause'>;
}

export type QueryReturn<T = any> = [
  {
    loading: boolean;
    loaded: boolean;
    hydrated: boolean;
    hasFetched: boolean;
    data: T;
  },
  {
    reset: () => void;
    request: (option: QueryOptions) => void;
    abort: () => void;
  }
]

export enum QueryStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  HYDRATED = 'HYDRATED',
//   ERROR = 'ERROR', // @todo: need to find out how this could work with the useAPI hook error results
}

enum ACTIONS  {
  LOADING = "LOADING",
  LOADED = "LOADED", // data is loaded when the first fetch has completed
  HYDRATED = "HYDRATED", // data is hydrated when the second fetch has completed for additional data, or no hydrate options specified
  RESET = "RESET", // clear data, error and reset status to IDLE
}

export interface QueryState<T = any> {
  status: QueryStatus;
  data: T;
//   error: any;
}
export type QueryAction = {
  type: ACTIONS;
  payload?: any;
}

export const initialState: QueryState = {
  status: QueryStatus.IDLE,
  data: null,
//   error: null,
};

export type QueryReducer = (state: QueryState, action: QueryAction) => QueryState;
export type QueryActions = {
  [k in ACTIONS]: QueryReducer;
}

const queryActions: QueryActions = {
  [ACTIONS.LOADING]: (state) => {
    return {
      ...state,
      status: QueryStatus.LOADED,
    };
  },
  [ACTIONS.LOADED]: (state, action) => {
    return {
      ...state,
      status: QueryStatus.LOADED,
      data: action.payload,
    };
  },
  [ACTIONS.HYDRATED]: (state, action) => {
    return {
      ...state,
      status: QueryStatus.HYDRATED,
      data: action.payload,
    };
  },
  [ACTIONS.RESET]: () => {
    return initialState;
  },
};

const queryReducer = (state: QueryState, action: QueryAction) => {
  if (action.type in ACTIONS) {
    return queryActions[action.type](state, action);
  }
  return state;
};

export const useQuery = <T = any>(req: (options?: AbortableQueryOptions, updateOptions?: (opts: QueryOptions) => void) => Promise<T>, options: QueryOptions = {}): QueryReturn  => {
  const mounted = useRef(true); 
  const reqRef = useRef(req);
  const optionsRef = useRef(options);
  const abortRef = useRef<AbortController | null>(null);
  const hasFetched = useRef(false);

  // Stable reference to avoid re-renders or stale data
  reqRef.current = req;
  optionsRef.current = options;

  const [state, dispatch] = useReducer<((s: QueryState<T>, a: QueryAction) => QueryState<T>)>(queryReducer, initialState);

  const updateOptions = useCallback((options: QueryOptions = {}) => {
    optionsRef.current = {
      ...optionsRef.current,
      ...options,
      hydrate: (options.hydrate || optionsRef.current.hydrate) ? { ...optionsRef.current.hydrate, ...options.hydrate } : undefined,
    };
  }, []);

  const request = useCallback(async (options?: QueryOptions) => {
    const call = async (withHydrate = false) => {
      updateOptions(options);

      // Hydrate data only on subsequent requests
      const { hydrate, ...opts } = optionsRef.current;

      if (!mounted.current) return;

      dispatch({ type: ACTIONS.LOADING });
      abortRef.current = new AbortController();

      const data = await reqRef.current({ ...opts, signal: abortRef.current.signal, hydrate: withHydrate ? hydrate : undefined }, updateOptions);
        
      if (!mounted.current) return;

      hasFetched.current = true;
      dispatch({ type: withHydrate ? ACTIONS.HYDRATED : ACTIONS.LOADED, payload: data });
    };

    if (state.status in [QueryStatus.IDLE, QueryStatus.LOADED, QueryStatus.HYDRATED]) {
      await call();

      // If the data can be hydrated, then fetch it again with the hydrate options
      if (optionsRef.current.hydrate) {
        await call(!!optionsRef.current.hydrate);
      }
    }
  }, [state.status]);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const reset = useCallback(() => {
    abort();
    if (!mounted.current) return;
    hasFetched.current = false;
    dispatch({ type: ACTIONS.RESET });
  }, []);

  useEffect(() => {
    if (!optionsRef.current.pause) {
      request();
    }
    return () => {
      abortRef.current?.abort?.();
    };
  }, []);

  return [{
    loading: state.status === QueryStatus.LOADING,
    loaded: state.status === QueryStatus.LOADED,
    hydrated: state.status === QueryStatus.HYDRATED || state.status === QueryStatus.LOADED && !options?.hydrate,
    hasFetched: hasFetched.current,
    data: state.data,
  }, {
    request,
    abort,
    reset,
  }];
};