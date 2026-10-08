import {
  useEffect,
  useState,
} from 'react'

import {
  getAuditLogs,
  clearAuditLogs,
} from './payrollLocalService'

import useAuth from '../../hooks/useAuth'

import Button from '../../components/Button'

import './Hrms.css'


export default function AuditLog() {

  const {
    user,
  } = useAuth()


  const [
    logs,
    setLogs,
  ] = useState([])


  const load = () => {

    setLogs(
      getAuditLogs()
    )

  }


  useEffect(
    () => {

      load()

    },
    []
  )


  const clearLogs = () => {

    if (
      !window.confirm(
        'Clear the complete local audit log?'
      )
    ) {

      return

    }


    clearAuditLogs()

    load()

  }


  const canClear =
    user?.is_superuser ||
    user?.profile?.role ===
      'SUPER_ADMIN'


  return (

    <div className="hr-page">

      <div className="hr-header">

        <div>

          <span
            className="dash-pill"
            style={{
              marginBottom: 6,
              display: 'inline-block',
            }}
          >
            SYSTEM CONTROL
          </span>

          <h1>
            Audit Log
          </h1>

          <p>
            Track local payroll and salary actions.
          </p>

        </div>


        {canClear && (

          <Button
            variant="secondary"
            onClick={clearLogs}
          >
            Clear Log
          </Button>

        )}

      </div>


      <section className="company-panel">

        <div className="company-table-wrap">

          <table className="company-table">

            <thead>

              <tr>

                <th>
                  Date / Time
                </th>

                <th>
                  Module
                </th>

                <th>
                  Action
                </th>

                <th>
                  Employee
                </th>

                <th>
                  Month
                </th>

                <th>
                  Amount
                </th>

                <th>
                  User
                </th>

                <th>
                  Description
                </th>

              </tr>

            </thead>


            <tbody>

              {logs.length === 0 ? (

                <tr>

                  <td
                    colSpan="8"
                    className="company-empty"
                  >

                    No audit activity yet.

                  </td>

                </tr>

              ) : (

                logs.map(
                  (log) => (

                    <tr
                      key={log.id}
                    >

                      <td>

                        {new Date(
                          log.timestamp
                        ).toLocaleString(
                          'en-IN'
                        )}

                      </td>

                      <td>
                        {log.module || '—'}
                      </td>

                      <td>

                        <strong>
                          {log.action}
                        </strong>

                      </td>

                      <td>
                        {log.employee || '—'}
                      </td>

                      <td>
                        {log.month || '—'}
                      </td>

                      <td>
                        {log.amount
                          ? `₹${Number(
                              log.amount
                            ).toLocaleString(
                              'en-IN'
                            )}`
                          : '—'}
                      </td>

                      <td>
                        {log.user || '—'}
                      </td>

                      <td>
                        {log.description || '—'}
                      </td>

                    </tr>

                  )
                )

              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>

  )

}