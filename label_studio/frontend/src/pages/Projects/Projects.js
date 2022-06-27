import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams as useRouterParams } from 'react-router';
import { Redirect } from 'react-router-dom';
import { Button } from '../../components';
import { Oneof } from '../../components/Oneof/Oneof';
import { Spinner } from '../../components/Spinner/Spinner';
import { ApiContext } from '../../providers/ApiProvider';
import { useContextProps } from '../../providers/RoutesProvider';
import { Block, Elem } from '../../utils/bem';
import { FF_DEV_2575, isFF } from '../../utils/feature-flags';
import { CreateProject } from '../CreateProject/CreateProject';
import { DataManagerPage } from '../DataManager/DataManager';
import { SettingsPage } from '../Settings';
import { useQuery } from "../../hooks/useQuery";
import './Projects.styl';
import { EmptyProjectsList, ProjectsList } from './ProjectsList';

const getCurrentPage = () => {
  const pageNumberFromURL = new URLSearchParams(location.search).get("page");

  return pageNumberFromURL ? parseInt(pageNumberFromURL) : 1;
};

let ProjectsPage = () => {
  const api = useContext(ApiContext);
  const [projectsList, setProjectsList] = useState([]);
  const [networkState, setNetworkState] = useState(null);
  const [currentPage, setCurrentPage] = useState(getCurrentPage());
  const [totalItems, setTotalItems] = useState(1);
  const setContextProps = useContextProps();
  const defaultPageSize = parseInt(localStorage.getItem('pages:projects-list') ?? 30);

  const [modal, setModal] = React.useState(false);
  const openModal = setModal.bind(null, true);
  const closeModal = setModal.bind(null, false);

  const fetchProjects = async (page  = currentPage, pageSize = defaultPageSize) => {
    setNetworkState('loading');
    const data = await api.callApi("projects", {
      params: { page, page_size: pageSize },
    });

    setTotalItems(data?.count ?? 1);
    setProjectsList(data.results ?? []);
    setNetworkState('loaded');
  };

  const loadNextPage = async (page, pageSize) => {
    setCurrentPage(page);
    await fetchProjects(page, pageSize);
  };

  React.useEffect(() => {
    fetchProjects();
  }, []);

  React.useEffect(() => {
    // there is a nice page with Create button when list is empty
    // so don't show the context button in that case
    setContextProps({ openModal, showButton: projectsList.length > 0 });
  }, [projectsList.length]);

  return (
    <Block name="projects-page">
      <Oneof value={networkState}>
        <Elem name="loading" case="loading">
          <Spinner size={64}/>
        </Elem>
        <Elem name="content" case="loaded">
          {projectsList.length ? (
            <ProjectsList
              projects={projectsList}
              currentPage={currentPage}
              totalItems={totalItems}
              loadNextPage={loadNextPage}
              pageSize={defaultPageSize}
            />
          ) : (
            <EmptyProjectsList openModal={openModal} />
          )}
          {modal && <CreateProject onClose={closeModal} />}
        </Elem>
      </Oneof>
    </Block>
  );
};

if (isFF(FF_DEV_2575)) {
  ProjectsPage = () => {
    const api = React.useContext(ApiContext);
    const setContextProps = useContextProps();
    const defaultPageSize = parseInt(localStorage.getItem('pages:projects-list') ?? 30);
    const [modal, setModal] = useState(false);
    const openModal = setModal.bind(null, true);
    const closeModal = setModal.bind(null, false);

    const [{ data, status: networkState, options }, { request: queryProjects }] = useQuery(async (options, updateOptions) => {
      const { hydrate, signal, ...query } = options;

      const res = await api.callApi('projects', { params: query, signal });

      if (!hydrate) {
        updateOptions({ hydrate: {
          query: {
            ids: res.results.map(d => d.id).join(','),
          },
        } });
      }
    
      return data;
    }, {
      query: {
        page: getCurrentPage(),
        page_size: defaultPageSize,
        include: "id,title,created_by,created_at,color,is_published,workspace,assignment_settings",
      }, // default query options
      hydrate: {}, // enable hydration request
    });

    const projectsList = useMemo(() => data?.results ?? [], [data?.results]);
    const totalItems = useMemo(() => data?.count ?? 1, [data?.count]);
    const currentPage = useMemo(() => options?.query?.page ?? getCurrentPage(), [options?.query?.page]); 

    const loadNextPage = async (page, pageSize) => {
      queryProjects({ query: { page, page_size: pageSize } });
    };

    useEffect(() => {
    // there is a nice page with Create button when list is empty
    // so don't show the context button in that case
      setContextProps({ openModal, showButton: projectsList?.length > 0 });
    }, [projectsList?.length]);

    return (
      <Block name="projects-page">
        <Oneof value={networkState}>
          <Elem name="loading" case="loading">
            <Spinner size={64}/>
          </Elem>
          <Elem name="content" case="loaded">
            {projectsList.length ? (
              <ProjectsList
                projects={projectsList}
                currentPage={currentPage}
                totalItems={totalItems}
                loadNextPage={loadNextPage}
                pageSize={defaultPageSize}
              />
            ) : (
              <EmptyProjectsList openModal={openModal} />
            )}
            {modal && <CreateProject onClose={closeModal} />}
          </Elem>
        </Oneof>
      </Block>
    );
  };
}

export { ProjectsPage };

ProjectsPage.title = "Projects";
ProjectsPage.path = "/projects";
ProjectsPage.exact = true;
ProjectsPage.routes = ({ store }) => [
  {
    title: () => store.project?.title,
    path: "/:id(\\d+)",
    exact: true,
    component: () => {
      const params = useRouterParams();

      return <Redirect to={`/projects/${params.id}/data`}/>;
    },
    pages: {
      DataManagerPage,
      SettingsPage,
    },
  },
];
ProjectsPage.context = ({ openModal, showButton }) => {
  if (!showButton) return null;
  return <Button onClick={openModal} look="primary" size="compact">Create</Button>;
};
