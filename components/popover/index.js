/**
 * External dependencies
 */
import classnames from 'classnames';
import { noop } from 'lodash';

/**
 * WordPress dependencies
 */
import { Component } from '@wordpress/element';
import { focus } from '@wordpress/dom';
import { keycodes } from '@wordpress/utils';

/**
 * Internal dependencies
 */
import './style.scss';
import withSafeTimeout from '../higher-order/with-safe-timeout';
import withFocusReturn from '../higher-order/with-focus-return';
import PopoverDetectOutside from './detect-outside';
import IconButton from '../icon-button';
import ScrollLock from '../scroll-lock';
import { Slot, Fill } from '../slot-fill';

const FocusManaged = withFocusReturn( ( { children } ) => children );

const { ESCAPE } = keycodes;

/**
 * Name of slot in which popover should fill.
 *
 * @type {String}
 */
const SLOT_NAME = 'Popover';
const isMobileViewport = () => window.innerWidth < 782;

class Popover extends Component {
	constructor() {
		super( ...arguments );

		this.focus = this.focus.bind( this );
		this.bindNode = this.bindNode.bind( this );
		this.getAnchorRect = this.getAnchorRect.bind( this );
		this.computePopoverPosition = this.computePopoverPosition.bind( this );
		this.throttledComputePopoverPosition = this.throttledComputePopoverPosition.bind( this );
		this.maybeClose = this.maybeClose.bind( this );

		this.nodes = {};

		this.state = {
			popoverLeft: null,
			popoverTop: null,
			yAxis: 'top',
			xAxis: 'center',
			contentHeight: null,
			contentWidth: null,
			isMobile: false,
			popoverSize: null,
		};
	}

	componentDidMount() {
		const popoverSize = this.updatePopoverSize();
		this.computePopoverPosition( popoverSize );
		this.focus();
		this.toggleWindowEvents( true );
	}

	componentDidUpdate( prevProps ) {
		if ( prevProps.position !== this.props.position ) {
			this.computePopoverPosition();
		}
	}

	componentWillUnmount() {
		this.toggleWindowEvents( false );
	}

	toggleWindowEvents( isListening ) {
		const handler = isListening ? 'addEventListener' : 'removeEventListener';

		window.cancelAnimationFrame( this.rafHandle );
		window[ handler ]( 'resize', this.throttledComputePopoverPosition );
		window[ handler ]( 'scroll', this.throttledComputePopoverPosition, true );
	}

	throttledComputePopoverPosition( event ) {
		if ( event.type === 'scroll' && this.nodes.content.contains( event.target ) ) {
			return;
		}
		this.rafHandle = window.requestAnimationFrame( () => this.computePopoverPosition() );
	}

	focus() {
		const { focusOnMount = true } = this.props;
		if ( ! focusOnMount ) {
			return;
		}

		const { content } = this.nodes;
		if ( ! content ) {
			return;
		}

		// Find first tabbable node within content and shift focus, falling
		// back to the popover panel itself.
		const firstTabbable = focus.tabbable.find( content )[ 0 ];
		if ( firstTabbable ) {
			firstTabbable.focus();
		} else {
			content.focus();
		}
	}

	getAnchorRect() {
		const { anchor } = this.nodes;
		if ( ! anchor || ! anchor.parentNode ) {
			return;
		}
		const rect = anchor.parentNode.getBoundingClientRect();
		// subtract padding
		const { paddingTop, paddingBottom } = window.getComputedStyle( anchor.parentNode );
		const topPad = parseInt( paddingTop, 10 );
		const bottomPad = parseInt( paddingBottom, 10 );
		return {
			x: rect.left,
			y: rect.top + topPad,
			width: rect.width,
			height: rect.height - topPad - bottomPad,
			left: rect.left,
			right: rect.right,
			top: rect.top + topPad,
			bottom: rect.bottom - bottomPad,
		};
	}

	updatePopoverSize() {
		const { content } = this.nodes;
		const rect = content.getBoundingClientRect();
		if (
			! this.state.popoverSize ||
			rect.width !== this.state.popoverSize.width ||
			rect.height !== this.state.popoverSize.height
		) {
			const popoverSize = {
				height: rect.height,
				width: rect.width,
			};
			this.setState( { popoverSize } );
			return popoverSize;
		}
		return this.state.popoverSize;
	}

	computePopoverPosition( popoverSize ) {
		const { width, height } = popoverSize || this.state.popoverSize;
		const { getAnchorRect = this.getAnchorRect, position = 'top', expandOnMobile } = this.props;
		const [ yAxis, xAxis = 'center' ] = position.split( ' ' );

		const rect = getAnchorRect();
		const popoverLeft = Math.round( rect.left + ( rect.width / 2 ) );

		// y axis aligment choices
		const topAlignment = {
			popoverTop: rect.top,
			contentHeight: rect.top - height > 0 ? height : rect.top,
		};
		const bottomAlignment = {
			popoverTop: rect.bottom,
			contentHeight: rect.bottom + height > window.innerHeight ? window.innerHeight - rect.bottom : height,
		};

		// x axis alignment choices
		const centerAlignment = {
			contentWidth: (
				( popoverLeft - ( width / 2 ) > 0 ? ( width / 2 ) : popoverLeft ) +
				( popoverLeft + ( width / 2 ) > window.innerWidth ? window.innerWidth - popoverLeft : ( width / 2 ) )
			),
		};
		const leftAlignment = {
			contentWidth: popoverLeft - width > 0 ? width : popoverLeft,
		};
		const rightAlignment = {
			contentWidth: popoverLeft + width > window.innerWidth ? window.innerWidth - popoverLeft : width,
		};

		// Choosing the y axis
		let chosenYAxis;
		let contentHeight = null;
		if ( yAxis === 'top' && topAlignment.contentHeight === height ) {
			chosenYAxis = 'top';
		} else if ( yAxis === 'bottom' && bottomAlignment.contentHeight === height ) {
			chosenYAxis = 'bottom';
		} else {
			chosenYAxis = topAlignment.contentHeight > bottomAlignment.contentHeight ? 'top' : 'bottom';
			contentHeight = chosenYAxis === 'top' ? topAlignment.contentHeight : bottomAlignment.contentHeight;
		}

		// Choosing the x axis
		let chosenXAxis;
		let contentWidth = null;
		if ( xAxis === 'center' && centerAlignment.contentWidth === width ) {
			chosenXAxis = 'center';
		} else if ( xAxis === 'left' && leftAlignment.contentWidth === width ) {
			chosenXAxis = 'left';
		} else if ( xAxis === 'right' && rightAlignment.contentWidth === width ) {
			chosenXAxis = 'right';
		} else {
			chosenXAxis = leftAlignment.contentWidth > rightAlignment.contentWidth ? 'left' : 'right';
			contentWidth = chosenXAxis === 'left' ? leftAlignment.contentWidth : rightAlignment.contentWidth;
		}

		const newPopoverPosition = {
			isMobile: isMobileViewport() && expandOnMobile,
			yAxis: chosenYAxis,
			xAxis: chosenXAxis,
			popoverTop: chosenYAxis === 'top' ? topAlignment.popoverTop : bottomAlignment.popoverTop,
			popoverLeft,
			contentHeight,
			contentWidth,
		};

		if (
			! this.state.popoverLeft ||
			this.state.yAxis !== chosenYAxis ||
			this.state.xAxis !== chosenXAxis ||
			this.state.isMobile !== newPopoverPosition.isMobile
		) {
			this.setState( newPopoverPosition );
		}
	}

	maybeClose( event ) {
		const { onKeyDown, onClose } = this.props;

		// Close on escape
		if ( event.keyCode === ESCAPE && onClose ) {
			event.stopPropagation();
			onClose();
		}

		// Preserve original content prop behavior
		if ( onKeyDown ) {
			onKeyDown( event );
		}
	}

	bindNode( name ) {
		return ( node ) => this.nodes[ name ] = node;
	}

	render() {
		const {
			headerTitle,
			onClose,
			children,
			className,
			onClickOutside = onClose,
			// Disable reason: We generate the `...contentProps` rest as remainder
			// of props which aren't explicitly handled by this component.
			/* eslint-disable no-unused-vars */
			position,
			range,
			focusOnMount,
			getAnchorRect,
			expandOnMobile,
			/* eslint-enable no-unused-vars */
			...contentProps
		} = this.props;
		const {
			popoverLeft,
			popoverTop,
			yAxis,
			xAxis,
			contentHeight,
			contentWidth,
			popoverSize,
			isMobile,
		} = this.state;

		const classes = classnames(
			'components-popover',
			className,
			'is-' + yAxis,
			'is-' + xAxis,
			{
				'is-mobile': isMobile,
			}
		);

		// Disable reason: We care to capture the _bubbled_ events from inputs
		// within popover as inferring close intent.

		/* eslint-disable jsx-a11y/no-static-element-interactions */
		let content = (
			<PopoverDetectOutside onClickOutside={ onClickOutside }>
				<div
					ref={ this.bindNode( 'popover' ) }
					className={ classes }
					style={ {
						top: ! isMobile && popoverTop ? popoverTop + 'px' : undefined,
						left: ! isMobile && popoverLeft ? popoverLeft + 'px' : undefined,
						visibility: popoverSize ? undefined : 'hidden',
					} }
					{ ...contentProps }
					onKeyDown={ this.maybeClose }
				>
					{ isMobile && (
						<div className="components-popover__header">
							<span className="components-popover__header-title">
								{ headerTitle }
							</span>
							<IconButton className="components-popover__close" icon="no-alt" onClick={ onClose } />
						</div>
					) }
					<div
						ref={ this.bindNode( 'content' ) }
						className="components-popover__content"
						style={ {
							maxHeight: ! isMobile && contentHeight ? contentHeight + 'px' : undefined,
							maxWidth: ! isMobile && contentWidth ? contentWidth + 'px' : undefined,
						} }
						tabIndex="-1"
					>
						{ children }
					</div>
				</div>
			</PopoverDetectOutside>
		);
		/* eslint-enable jsx-a11y/no-static-element-interactions */

		// Apply focus return behavior except when default focus on open
		// behavior is disabled.
		if ( false !== focusOnMount ) {
			content = <FocusManaged>{ content }</FocusManaged>;
		}

		// In case there is no slot context in which to render, default to an
		// in-place rendering.
		const { getSlot } = this.context;
		if ( getSlot && getSlot( SLOT_NAME ) ) {
			content = <Fill name={ SLOT_NAME }>{ content }</Fill>;
		}

		return <span ref={ this.bindNode( 'anchor' ) }>
			{ content }
			{ isMobile && expandOnMobile && <ScrollLock /> }
		</span>;
	}
}

const PopoverContainer = withSafeTimeout( Popover );

PopoverContainer.contextTypes = {
	getSlot: noop,
};

PopoverContainer.Slot = () => <Slot bubblesVirtually name={ SLOT_NAME } />;

export default PopoverContainer;
