'use strict';

const Rule = require('./rule');
const GoogleSheetRepository = require('../storage/googleSheetRepository');
const propPath = require('property-path');

class ChallengeRule extends Rule {
    constructor(challengeId, targetMap) {
        super("n/a");

        this._target = challengeId.trim();
        this._regexTarget = new RegExp("^{0}[-\\d]*$".format(this._target), "i");
        this._targetMap = targetMap;
        this._isCorrect = null;
        this._concepts = targetMap.conceptIds;
        this._selected = null;
    }

    sourceAsUrl() {
        this._checkEvaluated();

        return GoogleSheetRepository.sourceAsUrl(this._targetMap);
    }

    isCorrect() {
        this._checkEvaluated();

        return this._isCorrect;
    }

    concepts() {
        this._checkEvaluated();

        return this._concepts;
    }

    substitutionVariables() {
        this._checkEvaluated();

        return {
            selected: this._selected,
            target: this._target
        };
    }

    evaluate(event) {

        let isActivated = false;

        this._selected = this._getProperty(event, "context.challengeId", false);
        if (this._selected != null && (event.action === "SUBMITTED" || event.action === "SELECTED")) {
            let matches = this._selected.match(this._regexTarget);
            isActivated = (matches != null && matches.length == 1);
            this._isCorrect = this._getProperty(event, "context.correct", true);
        }

        return isActivated;
    }

    _getProperty(obj, path, throwOnMissingProperty) {
        let propertyValue = propPath.get(obj, path);
        if (throwOnMissingProperty && propertyValue == undefined) {
            throw new Error("Unable to find event value at property path: " + path);
        }
        return propertyValue;
    }

    _checkEvaluated() {
        if (this._selected == null || this._target == null) {
            throw new Error("Challenge rule for '{0}' has not been evaluated.".format(this.challenge));
        }
    }
}

module.exports = ChallengeRule;