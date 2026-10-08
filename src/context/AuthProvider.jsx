import {
  useState,
  useCallback,
  useMemo,
} from 'react'

import {
  AuthContext,
} from './AuthContext'

import {
  loginRequest,
  logoutRequest,
} from '../features/auth/authService'

import {
  storage,
} from '../utils/storage'

import {
  clearSelectedWorkspace,
} from '../utils/workspace'


export function AuthProvider({
  children,
}) {

  const [
    token,
    setToken,
  ] = useState(
    () =>
      storage.getToken()
  )


  const [
    user,
    setUser,
  ] = useState(
    () =>
      storage.getUser()
  )


  /* =======================================================
     LOGIN
     ======================================================= */

  const login =
    useCallback(
      async (
        username,
        password
      ) => {

        clearSelectedWorkspace()


        const data =
          await loginRequest(
            username,
            password
          )


        storage.setToken(
          data.token
        )


        storage.setUser(
          data.user
        )


        setToken(
          data.token
        )


        setUser(
          data.user
        )

      },
      []
    )


  /* =======================================================
     UPDATE CURRENT USER
     ======================================================= */

  const updateCurrentUser =
    useCallback(
      (updatedUser) => {

        storage.setUser(
          updatedUser
        )

        setUser(
          updatedUser
        )

      },
      []
    )


  /* =======================================================
     LOGOUT
     ======================================================= */

  const logout =
    useCallback(
      async () => {

        try {

          await logoutRequest()

        } catch {
          // Continue local logout.
        }


        clearSelectedWorkspace()

        storage.clear()

        setToken(null)

        setUser(null)

      },
      []
    )


  const value =
    useMemo(
      () => ({

        user,

        token,

        isAuthenticated:
          Boolean(token),

        login,

        logout,

        updateCurrentUser,

      }),
      [
        user,
        token,
        login,
        logout,
        updateCurrentUser,
      ]
    )


  return (

    <AuthContext.Provider
      value={value}
    >

      {children}

    </AuthContext.Provider>

  )

}