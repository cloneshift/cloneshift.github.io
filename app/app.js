var app = angular.module('ss-widget', ['ui.router', 'ui.bootstrap', 'monospaced.qrcode'])

.config(function($stateProvider, $urlRouterProvider) {
    $stateProvider.state('widget-test', {
        url:  "/",
        views: {
            'shapeshift-widget': {
                templateUrl: 'app/views/widget.html',
                controller: 'WidgetCtrl'
            }
        }
    });

    $urlRouterProvider.otherwise('/');
})


.controller('WidgetCtrl', function($scope, $interval){
})

.directive('coinError', function(ShapeShiftApiService) {
    return {
        require:['^coinTrader'],
        restrict: 'E',
        transclude: true,
        scope: {
            depositInfo : '=ssError'
        },
        link: function(scope, element, attrs, controllers) {

        },
        templateUrl: 'app/views/coin-error.html'
    }
})

.directive('coinShiftButton', function(ShapeShiftApiService) {
    return {
        require:['^coinTrader'],
        restrict: 'E',
        transclude: true,
        scope: {
            ShiftState : '=shiftState',
            shiftIt : '=shiftIt'
        },
        link: function(scope, element, attrs, controllers) {
            console.log(scope.ShiftState)
        },
        templateUrl: 'app/views/coin-shift-button.html'
    }
})

.directive('coinDepositInfo', function(ShapeShiftApiService) {
    return {
        require:['^coinTrader'],
        restrict: 'E',
        transclude: true,
        scope: {
            depositInfo : '=depositInfo',
            DepositStatus :'=depositStatus'
        },
        link: function(scope, element, attrs, controllers) {

        },
        templateUrl: 'app/views/coin-deposit-info.html'
    }
})

.directive('coinSelector', function(ShapeShiftApiService){
    return {
        require:['^coinTrader'],
        restrict: 'E',
        transclude: true,
        scope: {
            coins: '=coins',
            label:'=label',
            selectedCoin:'=selectedCoin',
            getMarketData: '=getMarketData',
            amount:'=amount',
            marketData:'=marketData',
            coinAddress:'=coinAddress',
            direction:'=direction'
        },
        link: function(scope, element, attrs, controllers) {
            var coinTraderCtrl = controllers[0];

            scope.class = attrs.class;
            //scope.direction = attrs.direction;

            scope.$watch('coinAddress', function(newVal) {
                console.log(newVal);

                if (scope.direction === 'in') {
                    coinTraderCtrl.returnAddress(newVal);
                } else if (scope.direction === 'out') {
                    coinTraderCtrl.withdrawalAddress(newVal);
                }
            });

            scope.$watch('amount', function(newVal) {
                console.log(newVal)
                coinTraderCtrl.amount(newVal)
            });
        },
        templateUrl: 'app/views/coin-selector.html'
    }
})

.directive('coinTrader', function($interval, ShapeShiftApiService) {
    return {
        restrict: 'E',
        transclude: true,
        controller: function($scope, $q) {
            $scope.ShiftState = 'Mudar';
            $scope.withdrawalAddress = ''
            $scope.returnAddress = ''
            $scope.amount = '';
            $scope.marketData = {}

            this.withdrawalAddress = function(address) {
                $scope.withdrawalAddress = address;
            }

            this.returnAddress = function(address) {
                $scope.returnAddress = address;
            }

            this.amount = function(amount) {
                $scope.amount = amount;
            }

            $scope.getMarketDataIn = function(coin) {
                if(coin === $scope.coinOut) return $scope.getMarketData($scope.coinOut, $scope.coinIn);

                return $scope.getMarketData(coin, $scope.coinOut);
            }

            $scope.getMarketDataOut = function(coin) {
                if(coin === $scope.coinIn) return $scope.getMarketData($scope.coinOut, $scope.coinIn);

                return $scope.getMarketData($scope.coinIn, coin);
            }

            $scope.getMarketData = function(coinIn, coinOut) {
                $scope.coinIn = coinIn;
                $scope.coinOut= coinOut;

                if($scope.coinIn === undefined || $scope.coinOut === undefined) return;

                ShapeShiftApiService
                    .marketInfo($scope.coinIn, $scope.coinOut)
                    .then(function(marketData) {
                            $scope.marketData = marketData;
                    });

                ShapeShiftApiService
                    .GetRecentTxList()
                    .then(function(data) {
                        console.log(data);
                    });
            }

            ShapeShiftApiService
                .coins()
                .then(function(coins) {
                    $scope.coins = coins;
                    $scope.coinIn = coins['BTC'].symbol;
                    $scope.coinOut = coins['LTC'].symbol;
                    $scope.getMarketData($scope.coinIn, $scope.coinOut);
                });

            function checkForError(data) {
                if(data.error) return true;

                return false;
            }

            $scope.shiftIt = function() {
                console.log($scope.coinOut)
                var validate = ShapeShiftApiService.ValidateAddress($scope.withdrawalAddress, $scope.coinOut);

                validate.then(function(valid) {
                    console.log($scope.withdrawalAddress)
                    console.log(valid)
                    var tx = ShapeShift();

                    tx.then(function(txData) {
                        if (txData['fixedTxData']) {
                            txData = txData.fixedTxData;

                            if (checkForError(txData)) return;
                            console.log(txData)
                            var coinPair=txData.pair.split('_');
                            txData.depositType = coinPair[0].toUpperCase();
                            txData.withdrawalType = coinPair[1].toUpperCase();
                            var coin = $scope.coins[txData.depositType].name.toLowerCase();
                            console.log(coin)
                            txData.depositQR = coin + ":" + txData.deposit + "?amount=" + txData.depositAmount
                            $scope.txFixedPending = true;

                        } else if (txData['normalTxData']) {
                            txData = txData.normalTxData;
                            if(checkForError(txData)) return;

                            var coin = $scope.coins[txData.depositType.toUpperCase()].name.toLowerCase();
                            txData.depositQR = coin + ":" + txData.deposit;

                        } else if (txData['cancelTxData']) {
                            if (checkForError(txData.cancelTxData)) return;
                            if ($scope.txFixedPending) {
                                $interval.cancel($scope.txInterval);
                                $scope.txFixedPending = false;
                            }
                            $scope.ShiftState = 'Mudar';

                            return;
                        }

                        $scope.depositInfo = txData;
                        console.log($scope.depositInfo)
                        $scope.ShiftState = 'Cancelar';
                        $scope.GetStatus();
                        $scope.txInterval=$interval($scope.GetStatus, 8000);
                    });
                })
            };

            function ShapeShift() {
                if($scope.ShiftState === 'Cancelar') return ShapeShiftApiService.CancelTx($scope);
                if(parseFloat($scope.amount) > 0) return ShapeShiftApiService.FixedAmountTx($scope);

                return ShapeShiftApiService.NormalTx($scope);
            }

            $scope.GetStatus = function() {
                var address = $scope.depositInfo.deposit;

                ShapeShiftApiService
                    .GetStatusOfDepositToAddress(address)
                    .then(function(data) {
                        $scope.DepositStatus = data;

                        if ($scope.DepositStatus.status === 'complete') {
                            $interval.cancel($scope.txInterval);
                            $scope.depositInfo = null;
                            $scope.ShiftState = 'Mudar'
                        }
                    });
            }
        },
        templateUrl: 'app/views/coin-trader.html'
    }
})

.service('ShapeShiftApiService', function($q){
    var PUBLIC_API_KEY = '855e833416d7fd849bf6eda1e200f5228790a1513e49e15a7eaa9a2e591644d2c2f6684aa89b31eb6c4919bf75b5fc33458ab44924db577a16ce7c4f1bfef448'
    var SSA = new ShapeShift.ShapeShiftApi(PUBLIC_API_KEY);

    return {
        coins: function() {
            var Q = $q.defer();
            var coins = null;

            if (coins === null) {
                SSA.GetCoins(function(data) {
                    coins = data;
                    Q.resolve(coins);
                });
            } else {
                Q.resolve(coins);
            }

            return Q.promise;
        },
        marketInfo: function(coinIn, coinOut) {
            var Q = $q.defer();

            SSA.GetMarketInfo(coinIn, coinOut, function(data) {
                Q.resolve(data);
            });

            return Q.promise;
        },
        FixedAmountTx: function($scope) {
            var Q = $q.defer();

            $scope.ssError = null;

            var fixedTx = SSA.CreateFixedTx(
                $scope.amount, $scope.withdrawalAddress,
                $scope.coinIn, $scope.coinOut
            );

            console.log(fixedTx);

            SSA.FixedAmountTx(fixedTx, function(data) {
                console.log(data);
                return Q.resolve({ fixedTxData : data.success });
            });

            return Q.promise;
        },
        NormalTx : function($scope) {
            var Q = $q.defer();
            var normalTx = SSA.CreateNormalTx($scope.withdrawalAddress, $scope.coinIn, $scope.coinOut);

            SSA.NormalTx(normalTx, function(data) {
                Q.resolve({ normalTxData : data });
            });

            return Q.promise;
        },
        CancelTx : function($scope) {
            var Q = $q.defer();

            SSA.CancelPendingTx({
                address:$scope.depositInfo.deposit
            },
            function(data) {
                Q.resolve({ cancelTxData : data });
            });

            return Q.promise;
        },
        GetRecentTxList : function() {
            var Q = $q.defer();

            SSA.GetRecentTxList(5, function(data)  {
                Q.resolve(data);
            });

            return Q.promise;
        },
        GetStatusOfDepositToAddress : function(address) {
            var Q = $q.defer();

            SSA.GetStatusOfDepositToAddress(address, function(data)  {
                Q.resolve(data);
            });

            return Q.promise;
        },
        ValidateAddress : function(address, coin) {
            var Q = $q.defer();

            SSA.ValidateAddress(address, coin, function(data){
                Q.resolve(data);
            });

            return Q.promise;
        }
    };
});
