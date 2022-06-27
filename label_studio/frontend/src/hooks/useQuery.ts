import { useCallback, useEffect, useReducer, useRef, useState } from "react";

export interface QueryOptions {
  query?: Record<string, any>;
  skipInitialRequest?: boolean;
  hydrate?: Omit<QueryOptions, 'hydrate' | 'skipInitialRequest'>;
}
export type AbortableQueryOptions<T = Record<string, any>>  = T & {
  signal: AbortSignal;
  hydrate: boolean
}

export enum QueryStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  HYDRATING = 'HYDRATING',
  HYDRATED = 'HYDRATED',
  ERROR = 'ERROR',
}

enum ACTIONS  {
  LOADING = "LOADING",
  LOADED = "LOADED", // data is loaded when the first fetch has completed
  HYDRATING = "HYDRATING", // initial data is loaded, and the data is being hydrated
  HYDRATED = "HYDRATED", // data is hydrated when the second fetch has completed for additional data, or no hydrate options specified
  ERROR = "ERROR", // error is set when any fetch has failed
  RESET = "RESET", // clear data, error and reset status to IDLE
}

export type QueryReturn<T = any> = [
  {
    status: QueryStatus;
    hasFetched: boolean;
    data: T;
    error?: any;
    options: QueryOptions;
  },
  {
    reset: () => void;
    request: (option: QueryOptions) => void;
    abort: () => void;
  }
]

export interface QueryState<T = any> {
  status: QueryStatus;
  data: T;
  error?: any;
}
export type QueryAction = {
  type: ACTIONS;
  payload?: any;
}

export const initialState: QueryState = {
  status: QueryStatus.IDLE,
  data: null,
  error: null,
};

export type QueryReducer = (state: QueryState, action: QueryAction) => QueryState;
export type QueryActions = {
  [k in ACTIONS]: QueryReducer;
}

const queryActions: QueryActions = {
  [ACTIONS.LOADING]: (state) => {
    return {
      ...state,
      status: QueryStatus.LOADING,
    };
  },
  [ACTIONS.HYDRATING]: (state) => {
    return {
      ...state,
      status: QueryStatus.HYDRATING,
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
  [ACTIONS.ERROR]: (state, action) => {
    return {
      ...state,
      status: QueryStatus.ERROR,
      error: action.payload,
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
  const [, forceUpdate] = useState(null);

  // Stable reference to avoid re-renders or stale data
  reqRef.current = req;
  optionsRef.current = options;

  const [state, dispatch] = useReducer<((s: QueryState<T>, a: QueryAction) => QueryState<T>)>(queryReducer, initialState);

  const updateOptions = useCallback((options: QueryOptions = {}, force = false) => {
    optionsRef.current = {
      ...optionsRef.current,
      ...options,
      query: {
        ...optionsRef.current.query,
        ...options.query,
      },
      hydrate: (options.hydrate || optionsRef.current.hydrate) ? {
        ...optionsRef.current.hydrate,
        ...options.hydrate,
        query: (options.hydrate?.query || optionsRef.current.hydrate?.query) ? {
          ...optionsRef.current.hydrate?.query,
          ...options.hydrate?.query,
        } : undefined,
      } : undefined,
    };
    force && forceUpdate({} as any);
  }, []);

  /**
   * useQuery:
   * 
   * Manages any promise based requests, allowing for full lifecycle management and ability to abort in flight requests.
   * Can be used to wrap `useApi` to manage multi request hydrations where performance is an issue.
   *
   * Example: `Projects List query with hydrating secondary call for more expensive data` 
   * 
   * const projectsQuery = async (options: AbortableQueryOptions, updateOptions: ((options: QueryOptions) => void)): Promise<any> => {
   *   
   *     const { hydrate, signal, ...query } = options;
   *    
   *     const { error, ...data } = await api.callApi('projects', { params: query, signal, errorFilter: () => true });
   * 
   *     if (error) {
   *         return { error };
   *     }
   * 
   *     if (!hydrate) {
   *         updateOptions({ hydrate: {
   *             query: {
   *                 ids: data.results.map(d => d.id),
   *             },
   *         }});
   *     }
   * 
   *     return data;
   * }
   * 
   * const [{data, error, status: networkState, hasFetched}, { request: fetchProjects }] = useQuery(projectsQuery, {
   *     query: {
   *         page: 1,
   *         page_size: 30,
   *         include: "id,title,created_by,created_at,color,is_published,workspace,assignment_settings"
   *     }, // default query options
   *     hydrate: {}, // enable hydration request
   *     skipInitialRequest: true, // skip the initial request, useful for manually controlling all requests
   * });
   * 
   * fetchProjects(); // trigger the initial request
   * fetchProjects({ query: { page: 2 } });
   * fetchProjects({ query: { page: 2 }, hydrate: { query: { ids: [1, 2, 3] } } });
   * fetchProjects({ query: { page_size: 50 } })
   * 
   * const projects = data?.results || [];
   * const total = data?.count ?? 1;
   */
  const request = useCallback(async (options?: QueryOptions) => {
    const call = async (withHydrate = false) => {
      updateOptions(options);

      // Hydrate data only on subsequent requests
      const { query, hydrate } = optionsRef.current;

      if (!mounted.current || withHydrate && !hydrate?.query) return;

      dispatch({ type: withHydrate ? ACTIONS.HYDRATING : ACTIONS.LOADING });
      abortRef.current = new AbortController();

      const queryOptions = withHydrate ? hydrate?.query : query;

      try {
        const data = await reqRef.current({ ...queryOptions, signal: abortRef.current.signal, hydrate: withHydrate }, updateOptions);
        
        if ((data as any).error) {
          throw (data as any).error;
        }

        if (!mounted.current) return;

        hasFetched.current = true;
        dispatch({ type: withHydrate ? ACTIONS.HYDRATED : ACTIONS.LOADED, payload: data });
      } catch(err: any) {
        if (!mounted.current) return;
        dispatch({ type: ACTIONS.ERROR, payload: err.message });
      }
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
    if (!optionsRef.current.skipInitialRequest) {
      request();
    }
    return () => {
      abortRef.current?.abort?.();
      mounted.current = false;
    };
  }, []);

  return [{
    data: state.data,
    status: state.status,
    hasFetched: hasFetched.current,
    options: optionsRef.current,
  }, {
    request,
    abort,
    reset,
  }];
};