import {Organization, Bucket} from '../../src/types'
import _ from 'lodash'

describe('Tasks', () => {
  beforeEach(() => {
    cy.flush()

    cy.signin().then(({body}) => {
      cy.wrap(body.org).as('org')
      cy.wrap(body.bucket).as('bucket')

      cy.createToken(body.org.id, 'test token', 'active', [
        {action: 'write', resource: {type: 'views'}},
        {action: 'write', resource: {type: 'documents'}},
        {action: 'write', resource: {type: 'tasks'}},
      ]).then(({body}) => {
        cy.wrap(body.token).as('token')
      })
    })

    cy.fixture('routes').then(({orgs}) => {
      cy.get('@org').then(({id}: Organization) => {
        cy.visit(`${orgs}/${id}/tasks`)
      })
    })
  })

  it('cannot create a task with an invalid to() function', () => {
    const taskName = 'Bad Task'

    createFirstTask(taskName, ({name}) => {
      return `import "influxdata/influxdb/v1"
v1.tagValues(bucket: "${name}", tag: "_field")
from(bucket: "${name}")
  |> range(start: -2m)
  |> to(org: "${name}")`
    })

    cy.getByTestID('task-save-btn').click()

    cy.getByTestID('notification-error').should(
      'contain',
      'error calling function "to": missing required keyword argument "bucketID"'
    )
  })

  it('can create a task', () => {
    const taskName = 'Task'
    createFirstTask(taskName, ({name}) => {
      return `import "influxdata/influxdb/v1"
v1.tagValues(bucket: "${name}", tag: "_field")
from(bucket: "${name}")
  |> range(start: -2m)`
    })

    cy.getByTestID('task-save-btn').click()

    cy.getByTestID('task-card')
      .should('have.length', 1)
      .and('contain', taskName)
  })
  // this test is broken due to a failure on the post route
  it.skip('can create a task using http.post', () => {
    const taskName = 'Task'
    createFirstTask(taskName, () => {
      return `import "http"
http.post(
  url: "https://foo.bar/baz",
  data: bytes(v: "body")
)`
    })

    cy.getByTestID('task-save-btn').click()

    cy.getByTestID('task-card')
      .should('have.length', 1)
      .and('contain', taskName)
  })

  it('keeps user input in text area when attempting to import invalid JSON', () => {
    cy.getByTestID('page-header').within(() => {
      cy.contains('Create').click()
    })

    cy.getByTestID('add-resource-dropdown--import').click()
    cy.contains('Paste').click()
    cy.getByTestID('import-overlay--textarea')
      .click()
      .type('this is invalid JSON')
    cy.get('button[title*="Import JSON"]').click()
    cy.getByTestID('import-overlay--textarea--error').should('have.length', 1)
    cy.getByTestID('import-overlay--textarea').should($s =>
      expect($s).to.contain('this is invalid JSON')
    )
    cy.getByTestID('import-overlay--textarea').type(
      '{backspace}{backspace}{backspace}{backspace}{backspace}'
    )
    cy.get('button[title*="Import JSON"]').click()
    cy.getByTestID('import-overlay--textarea--error').should('have.length', 1)
    cy.getByTestID('import-overlay--textarea').should($s =>
      expect($s).to.contain('this is invalid')
    )
  })

  describe('When tasks already exist', () => {
    beforeEach(() => {
      cy.get('@org').then(({id}: Organization) => {
        cy.get<string>('@token').then(token => {
          cy.createTask(token, id)
        })
      })
      cy.reload()
    })

    it('can edit a task', () => {
      // Disabling the test
      cy.getByTestID('task-card--slide-toggle')
        .should('have.class', 'active')
        .then(() => {
          cy.getByTestID('task-card--slide-toggle')
            .click()
            .then(() => {
              cy.getByTestID('task-card--slide-toggle').should(
                'not.have.class',
                'active'
              )
            })
        })

      // Editing a name
      const newName = 'Task'

      cy.getByTestID('task-card').then(() => {
        cy.getByTestID('task-card--name')
          .trigger('mouseover')
          .then(() => {
            cy.getByTestID('task-card--name-button')
              .click()
              .then(() => {
                cy.getByTestID('task-card--input')
                  .type(newName)
                  .type('{enter}')
              })

            cy.getByTestID('notification-success').should('exist')
            cy.contains(newName).should('exist')
          })
      })
    })

    it('can delete a task', () => {
      cy.getByTestID('task-card')
        .first()
        .trigger('mouseover')
        .then(() => {
          cy.getByTestID('context-delete-menu')
            .click()
            .then(() => {
              cy.getByTestID('context-delete-task')
                .click()
                .then(() => {
                  cy.getByTestID('empty-tasks-list').should('exist')
                })
            })
        })
    })
  })

  describe('Searching and filtering', () => {
    const newLabelName = 'click-me'
    const taskName = 'beepBoop'

    beforeEach(() => {
      cy.get('@org').then(({id}: Organization) => {
        cy.get<string>('@token').then(token => {
          cy.createTask(token, id, taskName).then(({body}) => {
            cy.createAndAddLabel('tasks', id, body.id, newLabelName)
          })

          cy.createTask(token, id).then(({body}) => {
            cy.createAndAddLabel('tasks', id, body.id, 'bar')
          })
        })
      })

      cy.fixture('routes').then(({orgs}) => {
        cy.get('@org').then(({id}: Organization) => {
          cy.visit(`${orgs}/${id}/tasks`)
        })
      })
    })

    it('can click to filter tasks by labels', () => {
      cy.getByTestID('task-card').should('have.length', 2)

      cy.getByTestID(`label--pill ${newLabelName}`).click()

      cy.getByTestID('task-card').should('have.length', 1)

      // searching by task name
      cy.getByTestID('search-widget')
        .clear()
        .type('bEE')

      cy.getByTestID('task-card').should('have.length', 1)
    })
  })

  describe('update & persist data', () => {
    // address a bug that was reported when editing tasks:
    // https://github.com/influxdata/influxdb/issues/15534
    const taskName = 'Task'
    const interval = '12h'
    const offset = '30m'
    beforeEach(() => {
      createFirstTask(
        taskName,
        ({name}) => {
          return `import "influxdata/influxdb/v1"
  v1.tagValues(bucket: "${name}", tag: "_field")
  from(bucket: "${name}")
    |> range(start: -2m)`
        },
        interval,
        offset
      )
      cy.getByTestID('task-save-btn').click()
      cy.getByTestID('task-card')
        .should('have.length', 1)
        .and('contain', taskName)

      cy.getByTestID('task-card--name')
        .contains(taskName)
        .click()
      // verify that the previously input data exists
      cy.getByInputValue(taskName)
      cy.getByInputValue(interval)
      cy.getByInputValue(offset)
    })

    it('can update a task', () => {
      const newTask = 'Taskr[sic]'
      const newInterval = '24h'
      const newOffset = '7h'
      // updates the data
      cy.getByTestID('task-form-name')
        .clear()
        .type(newTask)
      cy.getByTestID('task-form-schedule-input')
        .clear()
        .type(newInterval)
      cy.getByTestID('task-form-offset-input')
        .clear()
        .type(newOffset)

      cy.getByTestID('task-save-btn').click()
      // checks to see if the data has been updated once saved
      cy.getByTestID('task-card--name').contains(newTask)
    })

    it('persists data when toggling between scheduling tasks', () => {
      // toggles schedule task from every to cron
      cy.getByTestID('task-card-cron-btn').click()

      // checks to see if the cron helper text exists
      cy.getByTestID('form--box').should('have.length', 1)

      const cronInput = '0 2 * * *'
      // checks to see if the cron data is set to the initial value
      cy.getByInputValue('')
      cy.getByInputValue(offset)

      cy.getByTestID('task-form-schedule-input').type(cronInput)
      // toggles schedule task back to every from cron
      cy.getByTestID('task-card-every-btn').click()
      // checks to see if the initial interval data for every persists
      cy.getByInputValue(interval)
      cy.getByInputValue(offset)
      // toggles back to cron from every
      cy.getByTestID('task-card-cron-btn').click()
      // checks to see if the cron data persists
      cy.getByInputValue(cronInput)
      cy.getByInputValue(offset)
      cy.getByTestID('task-save-btn').click()
    })
  })

  describe('renders the correct name when toggling between tasks', () => {
    // addresses an issue that was reported when clicking tasks
    // this issue could not be reproduced manually | testing:
    // https://github.com/influxdata/influxdb/issues/15552
    const firstTask = 'First_Task'
    const secondTask = 'Second_Task'
    const interval = '12h'
    const offset = '30m'
    const flux = name => `import "influxdata/influxdb/v1"
    v1.tagValues(bucket: "${name}", tag: "_field")
    from(bucket: "${name}")
      |> range(start: -2m)`
    beforeEach(() => {
      createFirstTask(
        firstTask,
        ({name}) => {
          return flux(name)
        },
        interval,
        offset
      )
      cy.getByTestID('task-save-btn').click()
      cy.getByTestID('task-card')
        .should('have.length', 1)
        .and('contain', firstTask)

      cy.getByTestID('add-resource-dropdown--button').click()
      cy.getByTestID('add-resource-dropdown--new').click()
      cy.getByInputName('name').type(secondTask)
      cy.getByTestID('task-form-schedule-input').type(interval)
      cy.getByTestID('task-form-offset-input').type(offset)
      cy.get<Bucket>('@bucket').then(bucket => {
        cy.getByTestID('flux-editor').within(() => {
          cy.get('.react-monaco-editor-container')
            .should('be.visible')
            .click()
            .focused()
            .type(flux(bucket), {force: true, delay: 2})
        })
      })
      cy.getByTestID('task-save-btn').click()
      cy.getByTestID('task-card')
        .should('have.length', 2)
        .and('contain', firstTask)
        .and('contain', secondTask)
      cy.getByTestID('task-card--name')
        .contains(firstTask)
        .click()
    })

    it('when navigating using the navbar', () => {
      // verify that the previously input data exists
      cy.getByInputValue(firstTask)
      // navigate home
      cy.get('div.cf-nav--item.active').click()
      // click on the second task
      cy.getByTestID('task-card--name')
        .contains(secondTask)
        .click()
      // verify that it is the correct data
      cy.getByInputValue(secondTask)
      cy.get('div.cf-nav--item.active').click()
      // navigate back to the first one to verify that the name is correct
      cy.getByTestID('task-card--name')
        .contains(firstTask)
        .click()
      cy.getByInputValue(firstTask)
    })

    it('when navigating using the cancel button', () => {
      // verify that the previously input data exists
      cy.getByInputValue(firstTask)
      // navigate home
      cy.getByTestID('task-cancel-btn').click()
      // click on the second task
      cy.getByTestID('task-card--name')
        .contains(secondTask)
        .click()
      // verify that it is the correct data
      cy.getByInputValue(secondTask)
      cy.getByTestID('task-cancel-btn').click()
      // navigate back to the first task again
      cy.getByTestID('task-card--name')
        .contains(firstTask)
        .click()
      cy.getByInputValue(firstTask)
      cy.getByTestID('task-cancel-btn').click()
    })

    it('when navigating using the save button', () => {
      // verify that the previously input data exists
      cy.getByInputValue(firstTask)
      // navigate home
      cy.getByTestID('task-save-btn').click()
      // click on the second task
      cy.getByTestID('task-card--name')
        .contains(secondTask)
        .click()
      // verify that it is the correct data
      cy.getByInputValue(secondTask)
      cy.getByTestID('task-save-btn').click()
      // navigate back to the first task again
      cy.getByTestID('task-card--name')
        .contains(firstTask)
        .click()
      cy.getByInputValue(firstTask)
      cy.getByTestID('task-save-btn').click()
    })
  })
})

function createFirstTask(
  name: string,
  flux: (bucket: Bucket) => string,
  interval: string = '24h',
  offset: string = '20m'
) {
  cy.getByTestID('empty-tasks-list').within(() => {
    cy.getByTestID('add-resource-dropdown--button').click()
  })

  cy.getByTestID('add-resource-dropdown--new').click()

  cy.getByInputName('name').type(name)
  cy.getByTestID('task-form-schedule-input').type(interval)
  cy.getByTestID('task-form-offset-input').type(offset)

  cy.get<Bucket>('@bucket').then(bucket => {
    cy.getByTestID('flux-editor').within(() => {
      cy.get('.react-monaco-editor-container')
        .click()
        .focused()
        .type(flux(bucket), {force: true, delay: 2})
    })
  })
}
