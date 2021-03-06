// Libraries
import React, {PureComponent} from 'react'
import {connect} from 'react-redux'
import {withRouter, WithRouterProps} from 'react-router'

// Components
import {IconFont, ComponentColor, ResourceCard} from '@influxdata/clockface'
import {Context} from 'src/clockface'
import InlineLabels from 'src/shared/components/inlineLabels/InlineLabels'

// Actions
import {
  cloneDashboard,
  deleteDashboard,
  updateDashboard,
  addDashboardLabel,
  removeDashboardLabel,
} from 'src/dashboards/actions/thunks'
import {resetViews} from 'src/views/actions/creators'

// Selectors
import {viewableLabels} from 'src/labels/selectors'

// Types
import {AppState, Label} from 'src/types'

// Constants
import {DEFAULT_DASHBOARD_NAME} from 'src/dashboards/constants'

// Utilities
import {relativeTimestampFormatter} from 'src/shared/utils/relativeTimestampFormatter'

interface OwnProps {
  id: string
  name: string
  description: string
  updatedAt: string
  labels: Label[]
  onFilterChange: (searchTerm: string) => void
}

interface StateProps {
  allLabels: Label[]
}

interface DispatchProps {
  onDeleteDashboard: typeof deleteDashboard
  onCloneDashboard: typeof cloneDashboard
  onUpdateDashboard: typeof updateDashboard
  onAddDashboardLabel: typeof addDashboardLabel
  onRemoveDashboardLabel: typeof removeDashboardLabel
  onResetViews: typeof resetViews
}

type Props = OwnProps & DispatchProps & StateProps & WithRouterProps

class DashboardCard extends PureComponent<Props> {
  public render() {
    const {
      id,
      name,
      description,
      onFilterChange,
      labels,
      allLabels,
      updatedAt,
    } = this.props

    const dashboardLabels = labels

    return (
      <ResourceCard
        key={`dashboard-id--${id}`}
        testID="dashboard-card"
        name={
          <ResourceCard.EditableName
            onUpdate={this.handleUpdateDashboard}
            onClick={this.handleClickDashboard}
            name={name}
            noNameString={DEFAULT_DASHBOARD_NAME}
            testID="dashboard-card--name"
            buttonTestID="dashboard-card--name-button"
            inputTestID="dashboard-card--input"
          />
        }
        description={
          <ResourceCard.EditableDescription
            onUpdate={this.handleUpdateDescription}
            description={description}
            placeholder={`Describe ${name}`}
          />
        }
        labels={
          <InlineLabels
            labels={allLabels}
            selectedLabels={dashboardLabels}
            onFilterChange={onFilterChange}
            onAddLabel={this.handleAddLabel}
            onRemoveLabel={this.handleRemoveLabel}
          />
        }
        metaData={[
          <>{relativeTimestampFormatter(updatedAt, 'Last modified ')}</>,
        ]}
        contextMenu={this.contextMenu}
      />
    )
  }

  private handleUpdateDashboard = (name: string) => {
    const {id, onUpdateDashboard} = this.props

    onUpdateDashboard(id, {name})
  }

  private handleCloneDashboard = () => {
    const {id, name, onCloneDashboard} = this.props

    onCloneDashboard(id, name)
  }

  private get contextMenu(): JSX.Element {
    return (
      <Context>
        <Context.Menu icon={IconFont.CogThick}>
          <Context.Item label="Export" action={this.handleExport} />
        </Context.Menu>
        <Context.Menu
          icon={IconFont.Duplicate}
          color={ComponentColor.Secondary}
        >
          <Context.Item
            label="Clone"
            action={this.handleCloneDashboard}
            testID="clone-dashboard"
          />
        </Context.Menu>
        <Context.Menu
          icon={IconFont.Trash}
          color={ComponentColor.Danger}
          testID="context-delete-menu"
        >
          <Context.Item
            label="Delete"
            action={this.handleDeleteDashboard}
            testID="context-delete-dashboard"
          />
        </Context.Menu>
      </Context>
    )
  }

  private handleDeleteDashboard = () => {
    const {id, name, onDeleteDashboard} = this.props
    onDeleteDashboard(id, name)
  }

  private handleClickDashboard = () => {
    const {
      onResetViews,
      router,
      id,
      params: {orgID},
    } = this.props

    router.push(`/orgs/${orgID}/dashboards/${id}`)

    onResetViews()
  }

  private handleUpdateDescription = (description: string) => {
    const {id, onUpdateDashboard} = this.props

    onUpdateDashboard(id, {description})
  }

  private handleAddLabel = (label: Label) => {
    const {onAddDashboardLabel, id} = this.props

    onAddDashboardLabel(id, label)
  }

  private handleRemoveLabel = (label: Label) => {
    const {onRemoveDashboardLabel, id} = this.props

    onRemoveDashboardLabel(id, label)
  }

  private handleExport = () => {
    const {
      router,
      params: {orgID},
      id,
    } = this.props

    router.push(`/orgs/${orgID}/dashboards/${id}/export`)
  }
}

const mstp = ({labels}: AppState): StateProps => {
  return {
    allLabels: viewableLabels(labels.list),
  }
}

const mdtp: DispatchProps = {
  onAddDashboardLabel: addDashboardLabel,
  onRemoveDashboardLabel: removeDashboardLabel,
  onResetViews: resetViews,
  onCloneDashboard: cloneDashboard,
  onDeleteDashboard: deleteDashboard,
  onUpdateDashboard: updateDashboard,
}

export default connect<StateProps, DispatchProps, OwnProps>(
  mstp,
  mdtp
)(withRouter(DashboardCard))
