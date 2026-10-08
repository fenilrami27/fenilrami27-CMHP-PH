import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import useAuth from '../hooks/useAuth'

import {
  clearSelectedWorkspace,
  getAvailableWorkspaces,
  getCurrentWorkspace,
  setSelectedWorkspace,
} from '../utils/workspace'


export const WorkspaceContext =
  createContext(null)


export function WorkspaceProvider({
  children,
}) {

  const {
    user,
  } = useAuth()


  const [
    activeWorkspace,
    setActiveWorkspaceState,
  ] = useState(() =>
    getCurrentWorkspace(user)
  )


  const availableWorkspaces =
    useMemo(
      () =>
        getAvailableWorkspaces(user),
      [user]
    )


  useEffect(() => {

    if (!user) {

      clearSelectedWorkspace()

      setActiveWorkspaceState(
        null
      )

      return

    }


    const current =
      getCurrentWorkspace(user)


    setActiveWorkspaceState(
      current
    )


    if (current) {

      setSelectedWorkspace(
        current
      )

    }

  }, [user])


  const setActiveWorkspace =
    useCallback(
      (workspace) => {

        const allowed =
          availableWorkspaces.some(
            (item) =>
              item.id === workspace
          )


        if (!allowed) {
          return
        }


        setSelectedWorkspace(
          workspace
        )


        setActiveWorkspaceState(
          workspace
        )

      },
      [
        availableWorkspaces,
      ]
    )


  const activeOption =
    useMemo(
      () =>
        availableWorkspaces.find(
          (item) =>
            item.id ===
            activeWorkspace
        ) || null,
      [
        availableWorkspaces,
        activeWorkspace,
      ]
    )


  const hasWorkspaceSwitcher =
    availableWorkspaces.length > 1


  const value =
    useMemo(
      () => ({

        activeWorkspace,

        activeOption,

        availableWorkspaces,

        setActiveWorkspace,

        hasWorkspaceSwitcher,

      }),
      [
        activeWorkspace,
        activeOption,
        availableWorkspaces,
        setActiveWorkspace,
        hasWorkspaceSwitcher,
      ]
    )


  return (
    <WorkspaceContext.Provider
      value={value}
    >
      {children}
    </WorkspaceContext.Provider>
  )

}