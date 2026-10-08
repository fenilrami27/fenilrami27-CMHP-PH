export function getErrorMessage(error) {
  const data = error?.response?.data

  if (data) {

    if (typeof data === 'string') {
      return data
    }

    if (data.error) {
      return data.error
    }

    if (data.detail) {
      return data.detail
    }

    const messages = []

    Object.entries(data).forEach(
      ([field, value]) => {

        const values =
          Array.isArray(value)
            ? value
            : [value]

        values.forEach(
          (message) => {

            if (
              typeof message === 'string'
            ) {

              const label =
                field === 'non_field_errors'
                  ? ''
                  : `${field}: `

              messages.push(
                `${label}${message}`
              )
            }
          }
        )
      }
    )

    if (messages.length) {
      return messages.join(' ')
    }

    return 'Something went wrong. Please try again.'
  }

  if (error?.request) {
    return 'Unable to reach the server. Please check your connection and try again.'
  }

  return (
    error?.message ||
    'Something went wrong. Please try again.'
  )
}