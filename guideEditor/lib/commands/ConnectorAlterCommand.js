"use strict";

/** 
 * Created once the Connector changed one of the edges ( {ConnectionPoint} )
 * 
 * @this {ConnectorAlterCommand} 
 * @constructor
 * @param {Number} connectorId - the id of the Connector
 */
function ConnectorAlterCommand(connectorId){
    this.oType = 'ConnectorAlterCommand';
    /**Any sequence of many mergeable actions can be packed by the history*/
    this.mergeable = false;
    this.firstExecute = true;
    this.connectorId = connectorId;
    var con = CONNECTOR_MANAGER.connectorGetById(this.connectorId);
    //-------------------store previous state-------------------------------
    //TODO: totally inefficient (massive storage) - we should store deltas
    this.turningPoints = Point.cloneArray(con.turningPoints);
    this.userChanges = con.cloneUserChanges();
    this.glues = Glue.cloneArray(CONNECTOR_MANAGER.glues);
    this.connectionPoints = ConnectionPoint.cloneArray(CONNECTOR_MANAGER.connectionPoints);            
}

ConnectorAlterCommand.prototype = {
    /**This method got called every time the Command must execute*/
    execute : function(){
        throw "Not implemented";
    },    
    /**This method should be called every time the Command should be undone*/
    undo : function(){ 
        var con = CONNECTOR_MANAGER.connectorGetById(this.connectorId);
        con.turningPoints = this.turningPoints;
        con.userChanges = this.userChanges;
        /*TODO: make changes to DIAGRAMO.debugSolutions here
         * because, otherwise, those changes are not reflected in debug painting of Connector
         */
        CONNECTOR_MANAGER.glues = this.glues;
        CONNECTOR_MANAGER.connectionPoints = this.connectionPoints;
        
        draw();
    }
}